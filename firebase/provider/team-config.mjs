// The Hosting configuration is public. Only use fields needed by Auth and Firestore.
export function teamFirebaseConfig(config, expectedProjectId) {
  if (!config || config.projectId !== expectedProjectId ||
      config.authDomain !== expectedProjectId + '.firebaseapp.com' ||
      typeof config.apiKey !== 'string' || !/^AIza[\w-]{35}$/.test(config.apiKey) ||
      typeof config.appId !== 'string' || !/^1:\d+:web:[\da-f]+$/i.test(config.appId)) {
    throw new Error('워밍업 프로젝트의 로그인 설정을 확인할 수 없어요.');
  }
  return {
    apiKey: config.apiKey,
    appId: config.appId,
    projectId: config.projectId,
    authDomain: config.authDomain,
  };
}
