# Prompt để giao việc deploy lên GCP

## Cách nhanh nhất: không cần AI, chỉ 2 lệnh

Nếu bạn chỉ muốn app chạy, **đừng dùng agent điều khiển trình duyệt** — mở
[Cloud Shell](https://shell.cloud.google.com/) (đã sẵn gcloud đăng nhập, node,
docker) và chạy:

```bash
git clone <repo-url> && cd smartwatch2
git checkout claude/inspiring-darwin-4xajv8

./scripts/gcp-setup.sh YOUR_PROJECT_ID asia-southeast1 you@university.edu
./scripts/deploy.sh
```

Khoảng 7 phút cho lần đầu, ~2 phút cho mỗi lần deploy lại. Xem `DEPLOY.md`.

Chỉ dùng prompt bên dưới khi bạn muốn agent **tự xử lý lỗi và tự kiểm chứng**
thay bạn.

---

## Prompt cho agent (copy từ đây)

````text
Deploy ứng dụng Smartwatch CEO Challenge trong repo này lên GCP, đến khi có URL
chạy được thật và BẠN đã tự kiểm chứng nó hoạt động.

## THÔNG TIN CỦA TÔI

- GCP_PROJECT_ID: <điền>
- REGION: asia-southeast1
- BOOTSTRAP_ADMIN_EMAIL: <email-của-tôi@truong.edu.vn>

## CÁCH LÀM

Repo đã có sẵn script làm toàn bộ việc này. ĐỪNG tự gõ lại từng lệnh gcloud, và
tuyệt đối đừng bấm qua GCP Console — chậm hơn hàng chục lần và dễ sai.

1. Đọc `DEPLOY.md` mục "Fast path" và `scripts/gcp-setup.sh` để biết script làm gì.
2. Kiểm tra tiền đề: `gcloud auth list` phải có account active. Nếu chưa, DỪNG
   và bảo tôi chạy `gcloud auth login` — đừng cố vòng qua.
3. Chạy `./scripts/gcp-setup.sh <PROJECT_ID> <REGION> <ADMIN_EMAIL>`.
   Script này idempotent: nếu lỗi giữa đường, sửa nguyên nhân rồi chạy lại.
4. Chạy `./scripts/deploy.sh`.
5. Nếu bất kỳ bước nào fail: đọc log, tìm nguyên nhân thật và sửa. Đừng bỏ bước
   test trong `cloudbuild.yaml` để cho build chạy qua.

## PHẢI TỰ KIỂM CHỨNG (phần quan trọng nhất)

`deploy.sh` chỉ smoke-test `GET /login`. Thế là CHƯA đủ. Đừng báo "xong" khi mới
thấy revision deploy thành công — hãy tự mở URL và xác nhận từng mục, rồi báo
kết quả THẬT của từng mục:

1. Đăng nhập bằng BOOTSTRAP_ADMIN_EMAIL → phải là ADMIN (kiểm ở `/admin`).
2. Tạo 1 lớp, thêm 1 sinh viên test, tạo 1 bài tập chính thức.
3. Với tài khoản sinh viên test: chơi trọn **6 quý**, xem được báo cáo tổng kết
   có điểm tổng kết, hạng trong game và 3 bài học.
4. Bảng xếp hạng lớp hiện đúng sinh viên đó; đổi thử cột sắp xếp. Nếu lỗi kèm
   link tạo index thì index composite chưa build xong — chờ rồi thử lại.
5. Xuất cả 2 file CSV: file `quarters` phải có 1 dòng header + 6 dòng quý cho
   mỗi sinh viên.
6. Tài khoản sinh viên phải bị chặn ở `/instructor`, `/admin`, `/sim-test` và
   nhận **403** khi gọi thẳng `/api/instructor/export`.
7. Đăng nhập Google hoạt động (nếu chưa, nói tôi cần bấm gì trong console).
8. Cloud Logging không có `PERMISSION_DENIED`.

## TUYỆT ĐỐI KHÔNG

- Không tạo/commit service-account key JSON. Cloud Run dùng ADC.
- Không nới lỏng `firestore.rules` để "cho dễ chạy".
- Không commit `.env.local` hay `.deploy.env`.
- Không sửa hệ số trong `src/domain/simulation/config.ts`, không đổi
  `engineVersion` hay `scenarioVersion` — đổi là điểm đã chấm của sinh viên mất
  tính so sánh.
- Không bỏ bước test trong `cloudbuild.yaml`.

## BÁO CÁO

- URL của service.
- Kết quả THẬT của từng mục 1–8 ở trên. Mục nào không chạy được thì nói rõ,
  đừng làm tròn thành "ok".
- Các bước tôi phải tự bấm trong console, kèm đường dẫn chính xác.
- Thời gian build thực tế và chi phí dự kiến hằng tháng.
````

---

## Nếu muốn deploy tự động qua CI (không cần người đăng nhập)

Tạo service account riêng cho việc deploy với các role: `roles/run.admin`,
`roles/cloudbuild.builds.editor`, `roles/artifactregistry.writer`,
`roles/iam.serviceAccountUser`, `roles/firebaserules.admin`,
`roles/datastore.indexAdmin`. Sau đó gắn Cloud Build trigger vào nhánh — `SHORT_SHA`
sẽ do trigger tự cấp, và `cloudbuild.yaml` chạy được nguyên trạng.
