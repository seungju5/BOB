import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
} from 'firebase/firestore';

const members = 'bapmunnaMemberDirectory';
const accounts = 'bapmunnaAccounts';
const stages = ['new', 'review', 'done'];
const timestamp = (value) => (value instanceof Timestamp ? value.toDate().toISOString() : null);
const version = (value) => (value instanceof Timestamp ? value.seconds + ':' + value.nanoseconds : null);
const permissionError = () =>
  Object.assign(Error('운영자 권한을 다시 확인해 주세요.'), { code: 'permission-denied' });

export function createStudio(db, auth) {
  const grant = (email) => doc(db, 'bapmunnaOperators', email.toLowerCase());
  function current(uid) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid || !user.emailVerified || !user.email || user.email.includes('/'))
      throw permissionError();
    return user;
  }
  function member(row) {
    const data = row.data();
    return {
      uid: row.id,
      email: data.email,
      verified: data.verified === true,
      joined: timestamp(data.joinedAt),
      lastLogin: timestamp(data.lastLoginAt),
      disabled: data.disabled === true,
    };
  }
  function profile(row) {
    const data = row.data();
    if (data.ownerUid !== row.id) throw Error('프로필 소유 정보를 확인해 주세요.');
    return {
      uid: row.id,
      email: data.email,
      name: data.displayName,
      saved: timestamp(data.updatedAt),
      version: version(data.updatedAt),
    };
  }
  async function bound(uid, task) {
    const user = current(uid);
    const result = await task();
    if (current(uid) !== user) throw permissionError();
    return result;
  }
  return {
    watch(uid, callback, failed) {
      const user = current(uid);
      return onSnapshot(
        grant(user.email),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache) {
            callback(null);
            return;
          }
          callback(auth.currentUser === user && snap.data()?.enabled === true);
        },
        failed,
      );
    },
    async allowed(uid) {
      return bound(
        uid,
        async () => (await getDocFromServer(grant(current(uid).email))).data()?.enabled === true,
      );
    },
    // An Auth token supplies the owner, email, verification and login time. Rules enforce them again.
    async recordSignIn(uid) {
      const user = auth.currentUser;
      if (!user || user.uid !== uid || !user.email) return;
      const token = await user.getIdTokenResult();
      const login = new Timestamp(Number(token.claims.auth_time), 0);
      const ref = doc(db, members, uid);
      await runTransaction(db, async (tx) => {
        if (auth.currentUser !== user) throw permissionError();
        const snapshot = await tx.get(ref),
          existing = snapshot.data();
        if (
          existing?.email === user.email &&
          existing.verified === user.emailVerified &&
          existing.lastLoginAt?.toMillis() >= login.toMillis()
        )
          return;
        if (existing?.lastLoginAt?.toMillis() > login.toMillis()) return;
        const values = {
          email: user.email,
          emailLower: user.email.toLowerCase(),
          verified: user.emailVerified,
          lastLoginAt: login,
        };
        if (snapshot.exists()) tx.update(ref, values);
        else tx.set(ref, { ...values, joinedAt: serverTimestamp() });
      });
    },
    async overview(uid) {
      const directory = collection(db, members),
        profiles = collection(db, accounts);
      const day = 86400000;
      const today = Math.floor((Date.now() + 9 * 3600000) / day) * day - 9 * 3600000;
      const count = async (target) => (await getCountFromServer(target)).data().count;
      return bound(uid, async () => {
        const [total, verified, stored, days, latest, sync] = await Promise.all([
          count(directory),
          count(query(directory, where('verified', '==', true))),
          count(profiles),
          Promise.all(
            Array.from({ length: 7 }, async (_, i) => {
              const from = today - (6 - i) * day;
              return {
                day: new Date(from + 9 * 3600000).toISOString().slice(0, 10),
                count: await count(
                  query(
                    directory,
                    where('joinedAt', '>=', Timestamp.fromMillis(from)),
                    where('joinedAt', '<', Timestamp.fromMillis(from + day)),
                  ),
                ),
              };
            }),
          ),
          getDocsFromServer(
            query(directory, orderBy('joinedAt', 'desc'), orderBy(documentId(), 'desc'), limit(5)),
          ),
          getDocFromServer(doc(db, 'bapmunnaOpsMeta', 'directory')),
        ]);
        return {
          total,
          verified,
          stored,
          days,
          latest: latest.docs.map(member),
          syncedAt: timestamp(sync.data()?.syncedAt),
        };
      });
    },
    async page(uid, kind, search, cursor) {
      return bound(uid, async () => {
        const directory = kind === 'members';
        const target = collection(db, directory ? members : accounts);
        if (search) {
          if (!search.includes('@')) {
            if (search.includes('/') || search.length > 128 || search === '.' || search === '..')
              return { rows: [], next: null };
            const row = await getDocFromServer(doc(target, search));
            return { rows: row.exists() ? [directory ? member(row) : profile(row)] : [], next: null };
          }
          // The Auth directory stores a canonical email. Use its UID to find the profile, including older mixed-case emails.
          const hit = await getDocsFromServer(
            query(collection(db, members), where('emailLower', '==', search.toLowerCase()), limit(2)),
          );
          if (directory) return { rows: hit.docs.map(member), next: null };
          const found = await Promise.all(
            hit.docs.map((item) => getDocFromServer(doc(target, item.id))),
          );
          return { rows: found.filter((item) => item.exists()).map(profile), next: null };
        }
        const sort = directory ? 'joinedAt' : 'updatedAt';
        const constraints = [orderBy(sort, 'desc'), orderBy(documentId(), 'desc')];
        if (cursor) constraints.push(startAfter(new Timestamp(cursor.seconds, cursor.nanos), cursor.id));
        const page = await getDocsFromServer(query(target, ...constraints, limit(21)));
        const slice = page.docs.slice(0, 20),
          last = slice.at(-1);
        const time = last?.get(sort);
        return {
          rows: slice.map(directory ? member : profile),
          next:
            page.size > 20 && time instanceof Timestamp
              ? { seconds: time.seconds, nanos: time.nanoseconds, id: last.id }
              : null,
        };
      });
    },
    async detail(uid, id) {
      return bound(uid, async () => {
        const [person, account, storage, work] = await Promise.all([
          getDocFromServer(doc(db, members, id)),
          getDocFromServer(doc(db, accounts, id)),
          getDocFromServer(doc(db, 'bapmunnaStorageStatus', id)),
          getDocFromServer(doc(db, 'bapmunnaOpsCases', id)),
        ]);
        const data = work.data();
        return {
          member: person.exists() ? member(person) : null,
          profile: account.exists() ? profile(account) : null,
          householdAt: timestamp(storage.data()?.householdAt),
          settingsAt: timestamp(storage.data()?.settingsAt),
          stage: data?.stage ?? 'new',
          note: data?.note ?? '',
          caseVersion: version(data?.updatedAt),
          caseAt: timestamp(data?.updatedAt),
        };
      });
    },
    async save(uid, id, change) {
      return bound(uid, async () => {
        const isName = change.type === 'name';
        const ref = doc(db, isName ? accounts : 'bapmunnaOpsCases', id);
        const clean = isName ? change.name.trim() : change.note.trim();
        if (
          isName
            ? clean.length < 2 || clean.length > 30
            : !stages.includes(change.stage) || clean.length > 500
        )
          throw Error('입력한 길이와 처리 상태를 확인해 주세요.');
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          current(uid);
          if (version(snap.data()?.updatedAt) !== change.version || (isName && !snap.exists()))
            throw Error('다른 화면에서 먼저 저장했습니다. 최신 정보를 다시 조회해 주세요.');
          if (isName) tx.update(ref, { displayName: clean, updatedAt: serverTimestamp() });
          else
            tx.set(ref, {
              stage: change.stage,
              note: clean,
              editedBy: uid,
              updatedAt: serverTimestamp(),
            });
        });
      });
    },
  };
}
