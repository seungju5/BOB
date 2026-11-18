package com.bapmunna.senior;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Permission purpose screen. This exported activity cannot invoke the health bridge. */
public final class HealthPermissionsRationaleActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding * 2, padding, padding);
        content.setBackgroundColor(Color.rgb(255, 252, 243));
        TextView purpose = new TextView(this);
        purpose.setTextSize(24);
        purpose.setTextColor(Color.rgb(67, 49, 35));
        purpose.setText("건강 앱 걸음수 연결\n\n밥뭇나는 삼성헬스가 Health Connect에 공유한 오늘 걸음수만 읽어 본인 화면에 보여드려요. 건강 조회만으로 공유되지는 않아요.\n\n가족 연결과 이 휴대폰의 공유에 동의하면, 한국 시간 오늘 총걸음수를 연결된 가족 계정에 보내요. 공개 순위는 따로 선택한 경우에만 별명과 합계를 다른 참여자에게 보여드려요.\n\n건강 기록을 쓰지 않아요. 위치·심박수·운동 기록은 요청하지 않아요. 연결을 끄면 이 앱의 읽기와 추가 전송을 멈춰요. 이미 공개한 합계는 웹앱의 걸음수 공유·연결 그만하기로 지울 수 있어요. 건강 접근 권한은 Health Connect 설정에서 직접 해제할 수 있어요.");
        content.addView(purpose);
        Button policy = new Button(this);
        policy.setText("개인정보 처리방침 보기");
        policy.setTextSize(24);
        policy.setOnClickListener(view -> startActivity(new Intent(Intent.ACTION_VIEW,
            Uri.parse("https://impact-series.web.app/bapmunna/app/health/privacy/"))));
        content.addView(policy);
        Button done = new Button(this);
        done.setText("돌아가기");
        done.setTextSize(24);
        done.setOnClickListener(view -> finish());
        content.addView(done);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }
}
