# Hướng dẫn cài đặt — Smartwatch CEO Challenge

Tài liệu này dành cho người cài đặt hệ thống (bộ phận CNTT của trường, hoặc người triển khai).
Nếu bạn là **giảng viên** hoặc **sinh viên**, bạn không cần đọc file này — sau khi cài xong, mở
`/guide` trong app và đọc `HUONG_DAN.md`.

*English version: `INSTALL.en.md`.*

---

## 1. Bạn đang cài cái gì

Một ứng dụng web mô phỏng kinh doanh dùng để giảng dạy: sinh viên điều hành một hãng đồng hồ
thông minh qua 6 quý, cá nhân hoặc theo nhóm 6 người cạnh tranh nhau. Giao diện song ngữ
Việt/Anh.

Hệ thống chạy trên **Google Cloud Platform**, trong **dự án của chính trường bạn**:

| Thành phần | Dùng để làm gì |
|---|---|
| Cloud Run | Chạy ứng dụng web |
| Firestore | Lưu lớp học, phiên chơi, kết quả |
| Firebase Authentication | Đăng nhập bằng email và mật khẩu |
| Artifact Registry | Lưu ảnh container |
| Cloud Build | Build ứng dụng khi cài và khi cập nhật |

> **Dữ liệu sinh viên nằm hoàn toàn trong dự án GCP của trường bạn.** Bên cung cấp phần mềm không
> truy cập được, và không giữ bản sao nào.

---

## 2. Điều kiện cần

- Một **dự án Google Cloud** đã **bật thanh toán** (billing). Đây là thứ duy nhất bộ cài cố tình
  không tự làm, vì nó liên quan tới tiền của tổ chức bạn.
- Quyền **Owner** hoặc **Editor** trên dự án đó.
- `gcloud`, `python3`, `curl`.

> **Cách dễ nhất: dùng Google Cloud Shell.** Mở https://console.cloud.google.com/ rồi bấm biểu
> tượng `>_` ở góc trên bên phải. Cloud Shell đã có sẵn cả ba công cụ và đã đăng nhập sẵn — bạn
> không phải cài gì lên máy mình. Tải file ZIP lên đó rồi giải nén là chạy được ngay.

---

## 3. Cài đặt

```bash
unzip smartwatch-ceo-challenge-v1.0.0.zip
cd smartwatch-ceo-challenge-v1.0.0
./install.sh
```

Trình cài sẽ hỏi ba thứ: **mã dự án**, **vùng** (mặc định `asia-southeast1`, đặt tại Singapore —
gần Việt Nam nhất), và **email quản trị viên**.

Muốn xem trước mà không đụng gì vào GCP:

```bash
./install.sh --dry-run --project <ma-du-an> --admin <email>
```

Hoặc chạy thẳng, không hỏi:

```bash
./install.sh --project <ma-du-an> --region asia-southeast1 --admin <email>
```

**Mất khoảng 15 phút.** Phần lớn thời gian là Cloud Build biên dịch ứng dụng lần đầu. Lần cập
nhật sau chỉ khoảng 2 phút.

Trình cài **chạy lại được an toàn**. Hỏng giữa chừng thì sửa nguyên nhân rồi chạy lại — không có
trạng thái dở dang nào.

### Email quản trị viên — đọc kỹ chỗ này

Người **đầu tiên** đăng nhập bằng địa chỉ đó sẽ trở thành quản trị viên, và **không ai khác giành
được vai trò đó về sau**. Hãy dùng một địa chỉ mà người phụ trách thật sự nhận được thư.

Đặt sai thì sửa được: chạy lại `./scripts/gcp-setup.sh <du-an> <vung> <email-dung>` rồi
`./scripts/deploy.sh`.

---

## 4. Sau khi cài xong

1. Mở địa chỉ mà trình cài in ra.
2. Bấm **Tạo tài khoản**, đăng nhập bằng email quản trị viên.
3. Tạo lớp, thêm giảng viên, phát mã lớp cho sinh viên.
4. Gửi sinh viên đường dẫn `/guide` — trang giới thiệu và hướng dẫn chơi, **đọc được không cần
   đăng nhập**.

Tài liệu đầy đủ cho cả ba vai trò: **`HUONG_DAN.md`** trong gói này.

---

## 5. Hai bước trình duyệt, và chỉ hai

Bộ cài tự động gần như mọi thứ qua API. Còn đúng hai việc cần một người mở trình duyệt.

### 5.1. Cho phép tên miền đăng nhập — **thường tự động, nhưng hãy kiểm tra**

`deploy.sh` tự thêm địa chỉ Cloud Run vào danh sách authorized domains của Firebase. **Bước này
có thể thất bại với lỗi 403** (*"could not read the Identity Platform config"*), thường do quyền
IAM chưa kịp lan truyền.

**Triệu chứng:** đăng nhập báo lỗi `auth/unauthorized-domain`.

**Cách sửa, mất mười giây:**

1. Mở `https://console.firebase.google.com/project/<ma-du-an>/authentication/settings`
2. Mục **Authorized domains** → **Add domain**
3. Dán phần tên miền của địa chỉ app — **chỉ tên miền, không có `https://`**, ví dụ
   `smartwatch-ceo-challenge-abc123-as.a.run.app`
4. Lưu, tải lại trang đăng nhập

### 5.2. Đăng nhập bằng Google — **không bắt buộc**

Nếu muốn thêm nút "Đăng nhập bằng Google", cần tạo một OAuth client — đây là thao tác duy nhất
không thể tự động hoá được. Mở
`https://console.firebase.google.com/project/<ma-du-an>/authentication/providers` và bật Google.

**Không làm bước này cũng không sao.** Đăng nhập bằng email và mật khẩu chạy được ngay.

---

## 6. Chi phí

Ước tính cho **một lớp 60 sinh viên, một học kỳ**. Đây là **ước tính, không phải cam kết** — hoá
đơn thật phụ thuộc vùng, mức dùng và bảng giá Google tại thời điểm đó.

| Dịch vụ | Ghi chú | Ước tính / tháng |
|---|---|---|
| Cloud Run | Cấu hình `min-instances=0`: **không ai dùng thì không tính tiền**. Chỉ tính khi có request | $0 – $5 |
| Firestore | Vài nghìn document nhỏ. Thường nằm trong hạn mức miễn phí | $0 – $2 |
| Firebase Auth | Email/mật khẩu miễn phí ở quy mô này | $0 |
| Artifact Registry | Vài ảnh container | dưới $1 |
| Cloud Build | 120 phút build miễn phí mỗi ngày; một lần cài dùng ~4 phút | $0 |

**Thực tế: một lớp thường tốn dưới $5 một tháng, và $0 trong những tháng không dạy.** Chi phí lớn
nhất là Cloud Run khi cả lớp cùng vào một lúc, và nó chỉ kéo dài đúng buổi học đó.

Đặt hạn mức cảnh báo để yên tâm:
`https://console.cloud.google.com/billing/budgets`

---

## 7. Cập nhật lên phiên bản mới

```bash
unzip smartwatch-ceo-challenge-v<moi>.zip -d /tmp/moi
cp .deploy.env /tmp/moi/smartwatch-ceo-challenge-v<moi>/
cd /tmp/moi/smartwatch-ceo-challenge-v<moi>
./scripts/deploy.sh
```

Giữ lại `.deploy.env` là đủ — nó chứa toàn bộ cấu hình của bản cài. Dữ liệu sinh viên không bị
đụng tới.

> **Đọc ghi chú phát hành trước khi cập nhật.** Nếu một bản mới đổi hệ số mô phỏng hoặc
> `engineVersion`, điểm chấm bằng bản cũ sẽ **không còn so sánh được** với điểm bản mới. Đừng cập
> nhật giữa học kỳ khi đang chấm bài.

---

## 8. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `auth/unauthorized-domain` khi đăng nhập | Tên miền chưa được cho phép | Mục 5.1 |
| `PERMISSION_DENIED` lúc chạy `gcp-setup.sh` | Tài khoản không đủ quyền | Cần Owner hoặc Editor trên dự án |
| Báo lỗi liên quan billing | Chưa bật thanh toán | `https://console.cloud.google.com/billing/linkedaccount?project=<ma-du-an>` |
| Build thất bại ở bước `test` | Mã nguồn bị sửa và test đỏ | Xem log Cloud Build; bản gốc luôn xanh |
| `found no Cloud Build service account` | Dự án quá mới | Đợi một phút rồi chạy lại `gcp-setup.sh` |
| Đăng nhập được nhưng không phải admin | Email quản trị không khớp | Chạy lại `gcp-setup.sh` với email đúng, rồi `deploy.sh` |
| App trả lỗi 500 | Xem log | `gcloud run services logs read smartwatch-ceo-challenge --region <vung> --project <ma-du-an> --limit 50` |

---

## 9. Gỡ cài đặt

```bash
./scripts/uninstall.sh --dry-run    # xem sẽ xoá những gì
./scripts/uninstall.sh              # xoá app, giữ lại dữ liệu
./scripts/uninstall.sh --with-data  # xoá cả dữ liệu sinh viên
```

**Trước khi xoá dữ liệu, hãy xuất CSV.** Giảng viên xuất được từ trang bài tập. Xoá rồi không lấy
lại được, và trong đó có điểm đã chấm.

Script **không** xoá: bản thân dự án GCP, tài khoản đăng nhập Firebase, và lịch sử Cloud Build.
Nó in ra đường dẫn để bạn tự xoá nếu muốn.

---

## 10. Tuỳ chọn nâng cao

### Tên đối thủ

Mặc định, năm đối thủ chuẩn mang tên mô tả (*Premium benchmark*, *Sport benchmark*…). Các hình
mẫu này được dựng theo những thương hiệu có thật, và bạn có thể hiện tên thật bằng cách thêm vào
`.deploy.env`:

```
NEXT_PUBLIC_USE_BRAND_NAMES=true
```

rồi chạy lại `./scripts/deploy.sh`.

> **Cân nhắc trước khi bật.** Việc dùng nhãn hiệu của bên khác là quyết định của trường bạn và
> trường bạn chịu trách nhiệm — xem điều 12 trong `LICENSE`. Về mặt kỹ thuật, bật hay tắt
> **không đổi một con số nào**: điểm hoàn toàn giống nhau, chỉ khác cái tên hiển thị.
>
> **Nên quyết định trước khi khoá đầu tiên chơi.** Tên được ghi vào từng phiên lúc tạo, nên đổi
> giữa chừng sẽ khiến các ván cũ giữ tên cũ còn ván mới mang tên mới. Không hỏng gì, nhưng nhìn
> không nhất quán trong cùng một lớp.
>
> Chế độ **nhóm luôn dùng tên trung tính** (`Bot 2`…`Bot 6`) dù bật hay tắt — để một chỗ ngồi
> trống bên cạnh bạn cùng lớp không bị nhầm là một công ty thật.

### Tự động triển khai khi push code

Nếu trường bạn giữ mã nguồn trong GitHub và muốn tự động deploy mỗi lần push:

```bash
./scripts/setup-cd.sh
```

Cần một repository GitHub. Bản cài từ ZIP không có, và đó là bình thường — deploy chỉ là một lệnh.

### Chạy thử ở máy cá nhân

Xem `DEPLOY.md` mục "Local development" (tiếng Anh).

---

## 11. Giấy phép và thành phần bên thứ ba

- `LICENSE` — điều khoản sử dụng
- `THIRD_PARTY_NOTICES.md` — danh sách đầy đủ các gói nguồn mở và giấy phép của chúng

---

## 12. Cần giúp

Khi báo lỗi, gửi kèm những thứ này — có chúng thì chẩn đoán nhanh hơn nhiều:

1. Nội dung file `VERSION`
2. Vùng và mã dự án
3. Dòng lỗi đầy đủ, hoặc đoạn log lấy từ lệnh ở mục 8
4. Bạn đang làm bước nào thì gặp lỗi
