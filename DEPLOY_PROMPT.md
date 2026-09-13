# Prompt để giao việc deploy lên GCP

Dán nguyên khối prompt bên dưới vào một session Claude Code (hoặc AI agent khác)
có quyền chạy `gcloud` và `firebase`. Thay 5 giá trị trong phần **THÔNG TIN CỦA
TÔI** trước khi gửi.

Điều kiện cần có sẵn:

- `gcloud` đã cài và **đã đăng nhập** (`gcloud auth login`) — bước này cần
  trình duyệt nên bạn phải tự làm trước, agent không làm thay được.
- Một GCP project đã bật billing.
- `node` 20+ và `npm`.

---

## Prompt (copy từ đây)

````text
Hãy deploy ứng dụng Smartwatch CEO Challenge trong repo này lên Google Cloud
Platform, đến khi có một URL chạy được thật và bạn đã tự kiểm chứng nó hoạt động.

## THÔNG TIN CỦA TÔI (điền trước khi gửi)

- GCP_PROJECT_ID: <điền-project-id>
- REGION: asia-southeast1
- SERVICE_NAME: smartwatch-ceo-challenge
- BOOTSTRAP_ADMIN_EMAIL: <email-của-tôi@truong.edu.vn>
- Kịch bản mặc định cho lớp: smartwatch-v1

## TÀI LIỆU ĐÃ CÓ TRONG REPO — ĐỌC TRƯỚC KHI LÀM

- `DEPLOY.md` là nguồn chuẩn: nó có đủ lệnh gcloud, đúng 3 IAM role mà service
  account runtime cần, và phần troubleshooting. Hãy làm theo nó, đừng tự nghĩ ra
  quy trình khác.
- `ACCEPTANCE.md` liệt kê 20 tiêu chí nghiệm thu và cái nào đã kiểm chứng.
- `cloudbuild.yaml` đã chạy typecheck + toàn bộ test TRƯỚC khi build image.
- `Dockerfile` build Next.js standalone, chạy non-root, listen trên $PORT.
- `firestore.rules` **chặn toàn bộ** truy cập từ client SDK — đó là thiết kế có
  chủ đích, không phải thiếu sót.

## CÁC BƯỚC

1. Kiểm tra tiền đề trước khi làm gì cả: `gcloud auth list` phải có account
   active, và project phải bật billing. Nếu thiếu, DỪNG và nói tôi cần làm gì —
   đừng cố vòng qua.

2. Bật API, tạo Firestore (Native mode), tạo service account runtime với đủ 3
   role, tạo Artifact Registry repository — theo `DEPLOY.md` mục 1, 2, 5, 6.

3. Tạo Firebase web app và LẤY CONFIG BẰNG LỆNH, không bắt tôi copy từ console:
   ```
   firebase apps:create web "Smartwatch CEO Challenge" --project <PROJECT_ID>
   firebase apps:sdkconfig web <APP_ID> --project <PROJECT_ID>
   ```
   Từ output lấy ra `apiKey`, `authDomain`, `appId`.

4. Bật nhà cung cấp đăng nhập:
   - **Email/Password**: bật bằng Identity Toolkit admin API v2 nếu được
     (`PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/<PROJECT_ID>/config`).
   - **Google sign-in**: cần OAuth client, thường phải làm trong console. Nếu
     không tự động được, cứ nói rõ và đưa tôi đường dẫn chính xác cần bấm.

5. Deploy rules + indexes:
   `firebase deploy --only firestore:rules,firestore:indexes`

6. Build và deploy bằng `gcloud builds submit --config cloudbuild.yaml` với đủ
   substitutions (_REGION, _SERVICE, _FIREBASE_API_KEY, _FIREBASE_AUTH_DOMAIN,
   _FIREBASE_APP_ID, _BOOTSTRAP_ADMIN_EMAIL).
   Nếu build fail, đọc log và sửa nguyên nhân thật — đừng bỏ qua bước test
   trong cloudbuild.yaml để cho nó chạy qua.

7. Thêm hostname Cloud Run vào **authorized domains** của Firebase Auth. Thử API
   trước; nếu không được thì nói tôi bấm ở đâu. Bỏ bước này là đăng nhập sẽ lỗi
   `auth/unauthorized-domain`.

## PHẢI TỰ KIỂM CHỨNG (đây là phần quan trọng nhất)

Đừng báo "xong" khi chỉ mới thấy revision deploy thành công. Hãy tự mở URL và
xác nhận từng mục, rồi báo cáo kết quả thật của từng mục:

1. `/login` trả 200 và hiện được nút đăng nhập.
2. Đăng nhập bằng BOOTSTRAP_ADMIN_EMAIL → account này phải là **ADMIN** (kiểm
   tra ở `/admin`).
3. Tạo 1 lớp, thêm 1 sinh viên (dùng 1 email test đã đăng nhập 1 lần), tạo 1 bài
   tập chính thức.
4. Với tài khoản sinh viên test: chơi trọn **6 quý**, xem được báo cáo tổng kết
   có điểm tổng kết, hạng trong game và 3 bài học.
5. Bảng xếp hạng lớp hiện đúng sinh viên đó; thử đổi cột sắp xếp (nếu lỗi kèm
   link tạo index thì index composite chưa build xong hoặc bước 5 bị bỏ).
6. Xuất cả 2 file CSV và xác nhận có dữ liệu (file quarters phải có 1 dòng
   header + 6 dòng quý cho mỗi sinh viên).
7. Tài khoản sinh viên phải bị chặn ở `/instructor`, `/admin` và `/sim-test`, và
   nhận 403 khi gọi thẳng API export.
8. Kiểm tra Cloud Logging không có lỗi `PERMISSION_DENIED` (nếu có: service
   account thiếu `roles/datastore.user`).

## TUYỆT ĐỐI KHÔNG

- Không tạo hay commit service-account key JSON. Trên Cloud Run phải dùng
  Application Default Credentials của service account gắn vào revision.
- Không nới lỏng `firestore.rules` để "cho dễ chạy".
- Không commit `.env.local`.
- Không sửa hệ số nào trong `src/domain/simulation/config.ts`, không đổi
  `engineVersion` hay `scenarioVersion`. Đổi là kết quả đã chấm của sinh viên
  mất tính so sánh.
- Không bỏ bước chạy test trong `cloudbuild.yaml`.

## BÁO CÁO CHO TÔI

- URL của service.
- Kết quả THẬT của từng mục trong phần kiểm chứng — mục nào không chạy được thì
  nói rõ, đừng làm tròn thành "ok".
- Các bước tôi phải tự bấm trong console (nếu có), kèm đường dẫn chính xác.
- Chi phí dự kiến hằng tháng.
- Lệnh để deploy lại sau này khi tôi sửa code.
````

## Sau khi deploy xong

Khi bạn sửa code và muốn deploy lại, chỉ cần lệnh này (không phải làm lại từ
đầu):

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=\
_REGION=asia-southeast1,\
_FIREBASE_API_KEY="...",\
_FIREBASE_AUTH_DOMAIN="<project>.firebaseapp.com",\
_FIREBASE_APP_ID="...",\
_BOOTSTRAP_ADMIN_EMAIL=""
```

Để `_BOOTSTRAP_ADMIN_EMAIL` rỗng ở các lần deploy sau: nó chỉ có tác dụng với
tài khoản hoàn toàn mới, nên giữ lại cũng vô hại, nhưng bỏ đi thì sạch hơn.

## Nếu bạn muốn agent deploy hoàn toàn tự động (CI)

Thay vì `gcloud auth login`, tạo service account riêng cho việc deploy với các
role: `roles/run.admin`, `roles/cloudbuild.builds.editor`,
`roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`,
`roles/firebaserules.admin`, `roles/datastore.indexAdmin`. Rồi thêm vào đầu
prompt: *"Dùng Workload Identity Federation / service account đã cấu hình sẵn,
không cần gcloud auth login."*
