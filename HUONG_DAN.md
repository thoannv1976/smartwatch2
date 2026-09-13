# Hướng dẫn sử dụng — Smartwatch CEO Challenge

Tài liệu này dành cho người **dùng** app. Nếu bạn cần cài đặt / triển khai app
lên Google Cloud, xem [DEPLOY.md](./DEPLOY.md).

Giao diện có **tiếng Việt và tiếng Anh**; đổi bằng nút ngôn ngữ ở góc phải
thanh trên cùng. Mặc định là tiếng Việt.

---

## Mục lục

- [Hiểu game trong 2 phút](#hiểu-game-trong-2-phút)
- [Ba vai trò và quyền hạn](#ba-vai-trò-và-quyền-hạn)
- [Thứ tự triển khai lần đầu](#thứ-tự-triển-khai-lần-đầu-quan-trọng)
- [A. Hướng dẫn cho SINH VIÊN](#a-hướng-dẫn-cho-sinh-viên)
- [B. Hướng dẫn cho GIẢNG VIÊN](#b-hướng-dẫn-cho-giảng-viên)
- [C. Hướng dẫn cho QUẢN TRỊ VIÊN](#c-hướng-dẫn-cho-quản-trị-viên-admin)
- [Bảng tham chiếu](#bảng-tham-chiếu)
- [Xử lý lỗi thường gặp](#xử-lý-lỗi-thường-gặp)

---

## Hiểu game trong 2 phút

Sinh viên là **CEO của một hãng smartwatch mới**, cạnh tranh với **5 đối thủ
máy** (hình mẫu chiến lược: Apple, Garmin, Samsung, Huawei, Pixel) trong
**6 quý**.

Mỗi quý, sinh viên ra **một quyết định** gồm 2 phần:

1. Phân bổ **đúng 100 điểm chiến lược** cho 5 lĩnh vực: Sản phẩm, Công nghệ,
   Marketing số, Phân phối, Trải nghiệm khách hàng.
2. Chọn **Chỉ số giá (Price Index)** từ 80 đến 120. Giá tham chiếu thị trường
   là **$300**, nên chỉ số 90 ⇒ bán $270, chỉ số 110 ⇒ bán $330.

Hệ thống mô phỏng phản ứng của thị trường, trả về doanh số, doanh thu, lợi
nhuận, thị phần và **xếp hạng 6 công ty**. Sau 6 quý, sinh viên nhận **Báo cáo
tổng kết** với Điểm tổng kết (Final Score) và bảng xếp hạng lớp.

**Bài học mà game được thiết kế để dạy: chiến lược tốt nhất KHÔNG phải là tối
đa hoá một biến số.** Marketing mạnh mà phân phối yếu thì cầu không thành đơn
hàng. Giá rẻ làm tăng cầu nhưng mỏng biên lợi nhuận. Sản phẩm và công nghệ tạo
lợi thế tích luỹ, không mua được trong một quý.

> Năm thương hiệu đối thủ chỉ là **hình mẫu chiến lược mang tính giáo dục**. Số
> liệu trong game là giá trị mô phỏng, không phải thị phần hay kết quả kinh
> doanh thật.

### Hai điều quan trọng về cơ chế

- **Quyết định bị khoá sau khi gửi.** Không sửa, không chơi lại quý đó. Bấm gửi
  hai lần cũng chỉ ra một kết quả duy nhất (hệ thống đảm bảo ở tầng cơ sở dữ
  liệu).
- **Hệ thống không hiển thị dự báo lợi nhuận trước khi chốt.** Đây là chủ ý:
  sinh viên phải suy luận, không dò thử.

---

## Ba vai trò và quyền hạn

Quyền có tính **bao trùm**: Quản trị viên làm được mọi việc của Giảng viên,
Giảng viên làm được mọi việc của Sinh viên.

| Vai trò | Thấy menu | Làm được gì |
|---|---|---|
| **Sinh viên** (STUDENT) | Trang chủ | Chơi thử, làm bài tập chính thức, xem báo cáo của mình, xem bảng xếp hạng **lớp mình** |
| **Giảng viên** (INSTRUCTOR) | + Bảng điều khiển giảng viên, Chế độ kiểm thử mô phỏng | Tạo lớp, thêm sinh viên, tạo bài tập, xem tiến độ và chi tiết 6 quý của từng SV, xuất CSV |
| **Quản trị viên** (ADMIN) | + Quản trị hệ thống | Đổi vai trò người dùng, xem **tất cả** lớp học, xem cấu hình engine |

**Mọi tài khoản mới đăng nhập đều là Sinh viên.** Ngoại lệ duy nhất: email được
đặt trong biến `BOOTSTRAP_ADMIN_EMAIL` khi triển khai — tài khoản đó được tạo
với vai trò Quản trị viên, để lần deploy đầu tiên có người đủ quyền phong
giảng viên.

---

## Thứ tự triển khai lần đầu (quan trọng)

Có một ràng buộc dễ vướng: **giảng viên không thể thêm sinh viên vào lớp nếu
sinh viên đó chưa đăng nhập lần nào** — vì việc ghi danh gắn với tài khoản
Firebase, tài khoản chỉ tồn tại sau lần đăng nhập đầu.

Nên thứ tự đúng là:

| # | Ai làm | Việc |
|---|---|---|
| 1 | Quản trị viên | Đăng nhập bằng email đã đặt ở `BOOTSTRAP_ADMIN_EMAIL` |
| 2 | Quản trị viên | Vào **Quản trị hệ thống** → phong các đồng nghiệp thành **Giảng viên** |
| 3 | Giảng viên | Tạo lớp học |
| 4 | **Sinh viên** | **Đăng nhập app một lần** (chỉ cần đăng nhập rồi đóng) |
| 5 | Giảng viên | Thêm sinh viên vào lớp bằng email + mã sinh viên |
| 6 | Giảng viên | Tạo bài tập (seed, hạn cuối, số lần làm) |
| 7 | Sinh viên | Chơi thử để làm quen, rồi làm bài tập chính thức |

Cách làm thực tế ở bước 4: gửi link app cho cả lớp kèm câu *"đăng nhập một lần
trước buổi học sau"*. Ai chưa đăng nhập thì bước 5 sẽ báo
*"Không tìm thấy người dùng với email này"*.

---

## A. Hướng dẫn cho SINH VIÊN

### A1. Đăng nhập

1. Mở link app do giảng viên cung cấp.
2. Chọn **Đăng nhập với Google** (dùng email trường), hoặc dùng **Email / Mật
   khẩu** — chưa có thì bấm *"Chưa có tài khoản? Tạo mới"* (mật khẩu tối thiểu
   6 ký tự).
3. Vào **Trang chủ**.

### A2. Chơi thử trước (khuyến nghị mạnh)

Trang chủ có mục **Chơi thử (Practice)**:

- Chơi **bao nhiêu lần cũng được**.
- Kết quả được lưu để bạn xem lại, nhưng **không lên bảng xếp hạng lớp** và
  không tính điểm.
- Mỗi lượt chơi thử dùng một seed khác nhau, nên diễn biến thị trường không
  giống nhau.
- Chơi thử **luôn dùng kịch bản `smartwatch-v1`**. Nếu bài tập của lớp bạn dùng
  `smartwatch-v1-challenger` thì điểm khởi đầu của công ty trong bài chính thức
  sẽ **khác** với lúc chơi thử (bài chính thức cho bạn khởi đầu mạnh hơn). Công
  thức, sự kiện và cách tính điểm thì giống hệt nhau — nên chơi thử vẫn là cách
  luyện đúng.

Hãy chơi thử **trọn 6 quý ít nhất một lần** trước khi làm bài chính thức. Bài
chính thức thường chỉ cho **1 lần làm** và **không thể hoàn tác**.

### A3. Thành lập công ty

Bấm **Bắt đầu chơi thử** (hoặc **Bắt đầu bài tập**), rồi điền:

| Trường | Ghi chú |
|---|---|
| **Tên công ty** | 1–60 ký tự. Ví dụ: NovaTime |
| **Tên sản phẩm** | 1–60 ký tự. Ví dụ: Nova Watch One |
| **Định vị chiến lược ban đầu** | Chọn 1 trong 6: Giá phải chăng, Thể thao/Sức khoẻ, Cao cấp, Công nghệ, Phong cách sống, Cân bằng |

**Định vị KHÔNG tạo lợi thế nào trong game.** Nó chỉ được dùng ở Báo cáo tổng
kết để đối chiếu: bạn tuyên bố "cao cấp" nhưng suốt 6 quý lại hạ giá và bỏ mặc
sản phẩm thì báo cáo sẽ chỉ ra sự không nhất quán đó. Hãy chọn định vị bạn
thật sự định theo.

Bấm **Thành lập và bắt đầu Q1**.

### A4. Bảng điều khiển CEO

Đây là màn hình trung tâm, mỗi quý bạn quay về đây. Nó cho bạn:

- **Quý hiện tại** và **Sự kiện thị trường** của quý đó, kèm mô tả sự kiện ảnh
  hưởng thế nào (đọc kỹ — đây là thông tin để ra quyết định).
- **Quy mô thị trường quý này** (số chiếc).
- Các **KPI** hiện tại của công ty bạn: doanh số, doanh thu, thị phần, lợi
  nhuận, tiền mặt, và 6 năng lực (Chất lượng sản phẩm, Công nghệ, Nhận biết
  thương hiệu, Phân phối, Trải nghiệm khách hàng, CSAT).
- **Xếp hạng 6 công ty** — công ty của bạn được đánh dấu rõ.
- Cảnh báo đỏ nếu **tiền mặt âm**. Việc này *không* kết thúc game, nhưng ảnh
  hưởng điểm tài chính.

Các nút: **Ra quyết định quý này**, **Xem kết quả quý trước**, **Xem lịch sử
chiến lược**.

### A5. Ra quyết định (màn hình quan trọng nhất)

Bấm **Ra quyết định quý này**.

**Bước 1 — Phân bổ 100 điểm** cho 5 lĩnh vực:

| Lĩnh vực | Đầu tư vào |
|---|---|
| **Sản phẩm** | Pin, cảm biến, vật liệu, thiết kế, chất lượng phần cứng |
| **Công nghệ** | Phần mềm, AI, phân tích sức khoẻ, tích hợp app/hệ sinh thái |
| **Marketing số** | Search, social, influencer, video, content |
| **Phân phối** | Website riêng, sàn TMĐT, đại lý, giao hàng, độ sẵn có |
| **Trải nghiệm khách hàng** | UX website, chăm sóc, thông tin giao hàng, đổi trả, bảo hành |

- Ô **Điểm còn lại** cập nhật tức thời.
- Nút gửi **bị vô hiệu hoá** cho đến khi tổng đúng **100**.
- Có 4 **mẫu phân bổ nhanh** để bắt đầu rồi tự sửa:

| Mẫu | SP | CN | MKT | PP | CX |
|---|---|---|---|---|---|
| Cân bằng | 20 | 20 | 20 | 20 | 20 |
| Đổi mới | 30 | 30 | 15 | 10 | 15 |
| Tăng trưởng | 15 | 15 | 35 | 25 | 10 |
| Đặt lại về 0 | 0 | 0 | 0 | 0 | 0 |

Màn hình cũng hiện **năng lực hiện tại** của từng lĩnh vực, để bạn biết mình
đang mạnh yếu ở đâu. Lưu ý: năng lực có **hiệu suất giảm dần** — dồn điểm vào
một lĩnh vực đã cao sẽ kém hiệu quả hơn là nâng một lĩnh vực đang thấp.

**Bước 2 — Chọn Chỉ số giá** (80–120). Màn hình hiện **giá bán dự kiến** ngay
bên cạnh.

**Bước 3 — Xem chi phí quý này:** đầu tư chiến lược **$2.000.000** và chi phí
vận hành cố định **$2.000.000**. Hai khoản này cố định, không phụ thuộc bạn
phân bổ thế nào.

**Bước 4 — Bấm "Chốt quyết định và mô phỏng thị trường".**

> Quyết định **bị khoá sau khi gửi và không thể sửa lại**. Hệ thống cố tình
> không cho xem trước lợi nhuận.

### A6. Đọc kết quả quý

Sau khi mô phỏng, bạn thấy **Kết quả quý**:

- Toàn bộ KPI, kèm **mức thay đổi so với quý trước**.
- **Bối cảnh sự kiện** — sự kiện quý này đã tác động thế nào.
- **Cầu tiềm năng chưa được đáp ứng** — nếu có. Đây là số khách đã muốn mua mà
  bạn **không giao được** vì năng lực phân phối không theo kịp. Con số này rất
  đáng chú ý: nó là tiền bạn đã bỏ ra marketing nhưng mất trắng.
- **Tin tình báo đối thủ** — nhận định định tính, ví dụ *"Garmin đã trở nên
  quyết liệt hơn về giá"*. Bạn **không bao giờ thấy điểm đầu tư chính xác** của
  đối thủ (server lọc trước khi gửi về), đúng như thực tế cạnh tranh.
- **Quyết định của bạn quý này**, để đối chiếu.

Bấm **Sang quý tiếp theo** và lặp lại từ A5 cho tới Q6.

### A7. Lịch sử chiến lược

Vào bất cứ lúc nào từ Bảng điều khiển. Gồm:

- **Bảng quyết định Q1–Q6** — mọi phân bổ và chỉ số giá của bạn.
- **Bảng kết quả Q1–Q6**.
- **Biểu đồ diễn biến**: Doanh thu, Lợi nhuận ròng, Thị phần, Năng lực theo quý.

Dùng trang này trước mỗi quyết định để thấy xu hướng, đừng chỉ nhìn quý gần nhất.

### A8. Báo cáo tổng kết

Nộp quyết định Q6 xong, game **tự động kết thúc và tính điểm**. Báo cáo gồm:

**Tài chính** — Doanh thu luỹ kế, Lợi nhuận ròng luỹ kế, Tỷ suất lợi nhuận
cuối, Tiền mặt cuối kỳ.

**Cạnh tranh** — Thị phần cuối, Hạng trong game (6 công ty), Hạng trong lớp.

**Điểm đánh giá** — 5 điểm thành phần và **ĐIỂM TỔNG KẾT**:

| Điểm thành phần | Trọng số |
|---|---|
| Điểm lợi nhuận | 30% |
| Điểm thị phần | 25% |
| Điểm thương hiệu | 15% |
| Điểm hài lòng khách hàng (CSAT) | 15% |
| Điểm đổi mới | 15% |

Lưu ý: **lợi nhuận + thị phần = 55%**, nhưng **thương hiệu + CSAT + đổi mới =
45%** — ba thứ chỉ xây được bằng đầu tư tích luỹ nhiều quý. Đây là lý do
"bán được nhiều nhất" không đồng nghĩa "điểm cao nhất".

**Phân tích chiến lược** — hệ thống nêu hành vi chiến lược nổi bật của bạn,
quyết định trung bình 6 quý, **ba bài học** rút từ chính số liệu của bạn, và
phần **đối chiếu với định vị ban đầu**.

### A9. Bảng xếp hạng lớp

Vào từ Trang chủ (sau khi hoàn thành bài tập) hoặc từ Báo cáo.

- Chỉ so sánh **trong cùng một bài tập**, cùng phiên bản kịch bản và engine —
  vì chỉ khi đó kết quả mới thực sự so sánh được.
- Chỉ liệt kê sinh viên **đã hoàn thành đủ 6 quý**.
- Bạn chỉ xem được bảng của **lớp mình**.
- Đồng điểm xét theo thứ tự: **lợi nhuận luỹ kế → thị phần → nhận biết thương
  hiệu**.

### A10. Vài lời khuyên chiến lược

Không phải mẹo phá game, mà là những gì mô hình thật sự thưởng:

1. **Đọc sự kiện trước khi phân bổ.** Q5 nhân đóng góp của Công nghệ ×1,40 —
   đầu tư công nghệ ở Q5 có giá trị gấp rưỡi quý thường.
2. **Marketing không tự sinh ra đơn hàng.** Nếu Phân phối thấp, phần cầu bạn
   tạo ra sẽ mất đi. Xem chỉ số *Cầu tiềm năng chưa được đáp ứng*.
3. **Năng lực là tích luỹ, không mua vội được.** Đầu tư sản phẩm/công nghệ từ
   Q1 có 6 quý để sinh lãi; đầu tư ở Q5 thì gần như không kịp.
4. **Giá rẻ là con dao hai lưỡi.** Tăng cầu nhưng mỏng biên; điểm lợi nhuận
   chiếm 30%.
5. **CSAT nuôi thương hiệu.** Trải nghiệm khách hàng đẩy CSAT, CSAT đẩy nhận
   biết thương hiệu — hai điểm này cộng lại 30%.
6. **Cân bằng thì an toàn, nhưng đôi khi cần một điểm mạnh rõ rệt.**

---

## B. Hướng dẫn cho GIẢNG VIÊN

Sau khi được Quản trị viên phong vai trò, thanh menu của bạn có thêm **Bảng
điều khiển giảng viên** và **Chế độ kiểm thử mô phỏng**.

### B1. Tạo lớp học

**Bảng điều khiển giảng viên** → khung **Tạo lớp học**:

| Trường | Ví dụ |
|---|---|
| Tên lớp | Thương mại điện tử — Nhóm 02 |
| Học kỳ | HK1 2025-2026 |

Bấm **Tạo**. Lớp hiện ngay bên dưới.

### B2. Thêm sinh viên vào lớp

Mở lớp (bấm **Thành viên · Tạo bài tập mới**), rồi ở khung **Thành viên**:

1. Nhập **Email sinh viên** (đúng email họ dùng để đăng nhập app).
2. Nhập **Mã sinh viên**.
3. Bấm **Thêm sinh viên**.

> **Sinh viên phải đăng nhập app ít nhất một lần trước khi được thêm.** Nếu
> chưa, bạn sẽ nhận thông báo *"Không tìm thấy người dùng với email này"*. Đây
> không phải lỗi — hãy nhắc sinh viên đăng nhập rồi thêm lại.

### B3. Tạo bài tập chính thức

Vẫn trong trang lớp, khung **Tạo bài tập mới**:

| Trường | Ý nghĩa | Gợi ý |
|---|---|---|
| **Tên bài tập** | Hiện trên trang chủ của sinh viên | "Bài tập mô phỏng CEO — Lần 1" |
| **Thời điểm mở** | Trước đó sinh viên thấy "Chưa mở" | Ngày buổi học |
| **Hạn cuối** | Sau đó thấy "Đã hết hạn" | Mặc định +7 ngày |
| **Số lần làm tối đa** | 1–10 | **Để 1** cho bài tính điểm |
| **Phiên bản kịch bản** | `smartwatch-v1` hoặc `smartwatch-v1-challenger` | Xem B4 |
| **Seed chính thức** | Chuỗi quyết định diễn biến ngẫu nhiên của thị trường | Giữ mặc định, hoặc đặt riêng mỗi lớp |
| **Đang mở** | Bật/tắt nhận bài | Bật |

**Về seed:** mọi sinh viên trong cùng bài tập dùng **chung một seed**. Đó chính
là điều làm kết quả **so sánh được và tái lập được** — cùng quyết định thì cùng
kết quả, trên mọi máy, mãi mãi. Vì vậy:

- **Đừng đổi seed sau khi có sinh viên bắt đầu làm** — bạn sẽ mất tính so sánh.
- Muốn hai lớp làm bài độc lập, hãy đặt **hai seed khác nhau**.

**Về "Đang mở":** đây là công tắc bạn dùng trong lúc dạy. Ở trang chi tiết bài
tập có nút bật/tắt nhanh, **không ảnh hưởng** kịch bản, engine hay seed.

### B4. Chọn phiên bản kịch bản nào?

| Phiên bản | Sinh viên khởi đầu là | Hạng trong game 6 công ty |
|---|---|---|
| `smartwatch-v1` (mặc định) | Một startup, đúng theo bảng 2.4 của đặc tả | **Luôn là 6/6.** Không thể bắt kịp benchmark trong 6 quý |
| `smartwatch-v1-challenger` | Một challenger được đầu tư tốt | Chơi tốt có thể lên hạng 3; chia đều một cách hồn nhiên vẫn hạng 6 |

Cả hai dùng **cùng engine, cùng công thức, cùng hệ số** — chỉ khác dòng khởi
điểm của người chơi.

Đây là điều cần biết trước khi lên lớp: với `smartwatch-v1`, sinh viên **luôn
đứng thứ 6 trong game** dù chơi hay tới đâu (đã kiểm chứng bằng phép quét
95.634 phương án phân bổ). **Việc chấm điểm lớp không bị ảnh hưởng** — Điểm
tổng kết vẫn phân biệt rõ giỏi/kém (khoảng cách khoảng 21 điểm giữa chiến lược
tốt nhất và tệ nhất) — nhưng nếu bạn không giải thích trước, sinh viên sẽ tưởng
mình chơi sai.

Chọn thế nào:
- Muốn số liệu **khớp đúng tài liệu đặc tả** → `smartwatch-v1`, và hãy nói rõ
  với lớp rằng "hạng trong game" là hằng số, thứ cần theo là **Điểm tổng kết**.
- Muốn **hạng trong game có ý nghĩa** với sinh viên → `smartwatch-v1-challenger`.

> **Lưu ý nếu bạn chọn challenger:** chế độ **Chơi thử luôn dùng
> `smartwatch-v1`**, không theo kịch bản của bài tập. Sinh viên sẽ thấy công ty
> mình trong bài chính thức khởi đầu **mạnh hơn** lúc luyện. Hãy nói trước để
> họ không bối rối. Công thức và cách tính điểm thì hoàn toàn như nhau.

### B5. Theo dõi tiến độ và chấm bài

Mở **Xem chi tiết** của bài tập. Trang này có:

**8 ô số liệu tổng hợp:** Sinh viên trong lớp · Đã bắt đầu · Đã hoàn thành ·
Điểm trung bình · Điểm cao nhất · Điểm thấp nhất · Lợi nhuận luỹ kế trung bình
· Thị phần cuối trung bình.

**Bảng xếp hạng lớp sắp xếp được** theo 5 cột: Điểm tổng kết, Lợi nhuận luỹ kế,
Thị phần, CSAT, Thương hiệu. Đây là công cụ thảo luận rất tốt trên lớp: sắp
theo *Lợi nhuận* rồi sắp theo *Thị phần* và cho sinh viên thấy **hai thứ tự
không giống nhau**.

**Mức tham gia** — danh sách từng sinh viên: Chưa bắt đầu / Đang chơi / Đã hoàn
thành.

**Chi tiết sinh viên** — bấm vào một sinh viên để xem **cả 6 quý**: từng quyết
định, từng kết quả, từng năng lực. Dùng khi cần nhận xét cá nhân hoặc khi sinh
viên thắc mắc về điểm.

### B6. Xuất CSV

Hai nút ở trang chi tiết bài tập:

| Nút | Nội dung | Dùng để |
|---|---|---|
| **Xuất CSV · Điểm đánh giá** | Một dòng mỗi sinh viên hoàn thành: mã SV, tên, email, công ty, 5 điểm thành phần, Điểm tổng kết, doanh thu/lợi nhuận luỹ kế, thị phần, thương hiệu, CSAT, tiền mặt, hạng game, thời điểm hoàn thành | **Nhập vào bảng điểm** |
| **Xuất CSV · Bảng quyết định Q1–Q6** | Một dòng mỗi sinh viên mỗi quý: 5 điểm đầu tư, chỉ số giá, và toàn bộ KPI kết quả | Phân tích sâu, nghiên cứu, thảo luận trên lớp |

File CSV mở trực tiếp bằng Excel hoặc Google Sheets.

### B7. Chế độ kiểm thử mô phỏng (/sim-test)

Công cụ nội bộ, chỉ Giảng viên và Quản trị viên thấy. **Không ghi vào cơ sở dữ
liệu** — chạy hoàn toàn trên engine thuần.

Bạn có thể:
- Đặt **Master seed** rồi **Chạy 1 quý** hoặc **Chạy cả Q1–Q6**.
- Xem **quyết định của 5 đối thủ máy** (thứ mà sinh viên không được thấy).
- Xem **hệ số sự kiện**, **trọng số cầu** và **giá trị trung gian** của từng
  bước tính.
- **So sánh chiến lược**: chạy nhiều chiến lược cố định trên cùng seed và đối
  chiếu Điểm tổng kết.

Hai cách dùng thực tế:

1. **Chuẩn bị buổi học.** Thử seed bạn định dùng, xem chiến lược nào thắng,
   chuẩn bị sẵn câu hỏi thảo luận.
2. **Dạy trực tiếp.** Chiếu màn hình lên lớp, cho sinh viên đề xuất một phân bổ,
   chạy ngay và mổ xẻ tại sao ra kết quả đó.

---

## C. Hướng dẫn cho QUẢN TRỊ VIÊN (ADMIN)

Menu **Quản trị hệ thống** có 3 khung.

### C1. Người dùng — phân vai trò

Danh sách 200 người dùng gần nhất, kèm ô chọn vai trò trên mỗi dòng. Đổi vai
trò có hiệu lực ngay.

- **Không thể tự hạ quyền của chính mình.** Ràng buộc này để hệ thống không bao
  giờ rơi vào trạng thái không còn quản trị viên nào.
- Trước khi hạ một giảng viên xuống sinh viên, hãy nhớ: lớp học gắn với
  `instructorId` của họ. Họ sẽ mất quyền vào lớp của mình. Quản trị viên vẫn
  thấy mọi lớp.

### C2. Lớp học — toàn hệ thống

Danh sách **tất cả** lớp của mọi giảng viên, có link vào chi tiết. Dùng để hỗ
trợ giảng viên hoặc kiểm tra khi có sự cố.

### C3. Cấu hình engine — chỉ đọc

Hiện toàn bộ hệ số của cả hai phiên bản kịch bản: số quý, quy mô thị trường,
giá tham chiếu, tổng điểm chiến lược, chi phí đầu tư và vận hành, tiền mặt khởi
điểm, khoảng chỉ số giá, hệ số chia điểm lợi nhuận, tiêu chí xếp hạng quý, và
năng lực khởi điểm của người chơi.

**Đây là màn hình chỉ đọc, có chủ ý.** Muốn đổi hệ số thì phải tạo **phiên bản
engine mới**, vì:

> Mỗi lượt chơi hoàn thành đều ghi lại phiên bản engine và kịch bản nó được
> chơi trên đó, và **không bao giờ được tính lại**. Sửa hệ số của engine đang
> dùng sẽ làm kết quả đã chấm của sinh viên không còn so sánh được với kết quả
> mới — tức là phá điểm của cả lớp.

Nếu bạn cần đổi hệ số, đó là việc sửa mã nguồn (`src/domain/simulation/config.ts`)
kèm tăng `engineVersion`, rồi triển khai lại — không phải việc làm qua giao diện.

### C4. Việc thường làm nhất

Đầu mỗi học kỳ: vào **Người dùng**, phong giảng viên. Hết.

---

## Bảng tham chiếu

### Sáu sự kiện thị trường (cố định, luôn theo thứ tự này)

| Quý | Sự kiện | Quy mô thị trường | Tác động |
|---|---|---|---|
| **Q1** | Thị trường bình thường | 500.000 | Không có hệ số đặc biệt |
| **Q2** | Bùng nổ thể thao & sức khoẻ | 500.000 | Đóng góp của **Sản phẩm và Công nghệ ×1,20** |
| **Q3** | Cạnh tranh giá | 500.000 | Trọng số **Giá tăng lên 30%**, Sản phẩm giảm còn 25% |
| **Q4** | Kinh tế giảm tốc | **425.000** (−15%) | Thị trường co lại, vẫn rất nhạy cảm giá |
| **Q5** | Làn sóng tính năng AI | 500.000 | Đóng góp của **Công nghệ ×1,40** |
| **Q6** | Cao điểm mua sắm online | **600.000** (+20%) | **Marketing ×1,15**, Phân phối quan trọng hơn |

Sự kiện **giống nhau cho mọi lượt chơi** — đây là kịch bản dạy học, không phải
yếu tố ngẫu nhiên. Sinh viên biết trước hoàn toàn hợp lệ, thậm chí đáng khuyến
khích: lập kế hoạch 6 quý chính là kỹ năng cần học.

### Các con số cố định

| | |
|---|---|
| Số quý | 6 |
| Điểm chiến lược mỗi quý | 100 (phải dùng hết) |
| Khoảng chỉ số giá | 80–120 |
| Giá tham chiếu thị trường | $300 |
| Tiền mặt khởi điểm | $5.000.000 |
| Đầu tư chiến lược mỗi quý | $2.000.000 |
| Chi phí vận hành cố định mỗi quý | $2.000.000 |
| Xếp hạng từng quý tính theo | Thị phần |

---

## Xử lý lỗi thường gặp

### Sinh viên

| Thông báo | Nghĩa là gì | Làm gì |
|---|---|---|
| *Hiện chưa có bài tập nào được giao cho bạn* | Bạn chưa có trong lớp nào, hoặc lớp chưa có bài tập | Nhắc giảng viên thêm bạn vào lớp |
| *Bạn không thuộc lớp của bài tập này* | Chưa được ghi danh | Giảng viên thêm bằng email + mã SV |
| *Chưa mở* | Chưa đến "Thời điểm mở" | Chờ |
| *Đã hết hạn* | Quá hạn cuối | Liên hệ giảng viên |
| *Bạn đã dùng hết số lần làm bài* | Đã dùng hết số lần cho phép | Không làm lại được. Dùng **Chơi thử** để luyện |
| *Tổng 5 lĩnh vực đầu tư phải đúng 100 điểm* | Chưa phân bổ đủ/quá 100 | Xem ô **Điểm còn lại** |
| *Chỉ số giá phải nằm trong khoảng 80–120* | Ngoài khoảng cho phép | Chỉnh lại |
| *Quý này đã được gửi. Đây là kết quả đã lưu.* | Bạn gửi trùng (bấm hai lần, F5, mất mạng rồi thử lại) | **Không phải lỗi.** Kết quả đã lưu là kết quả chính thức |
| Cảnh báo **tiền mặt âm** | Chi nhiều hơn thu | Không kết thúc game, nhưng ảnh hưởng điểm tài chính. Cân nhắc tăng giá hoặc lấy hiệu quả |

### Giảng viên

| Thông báo | Nghĩa là gì | Làm gì |
|---|---|---|
| *Không tìm thấy người dùng với email này. Sinh viên cần đăng nhập ít nhất 1 lần.* | Tài khoản chưa tồn tại | Nhắc sinh viên đăng nhập một lần, rồi thêm lại. Kiểm tra cả lỗi chính tả email |
| *Bạn không có quyền truy cập trang này* | Chưa được phong Giảng viên, hoặc đang mở lớp của người khác | Nhờ Quản trị viên phong vai trò. Giảng viên chỉ thấy lớp của mình |
| Bảng xếp hạng trống | Chưa ai hoàn thành đủ **6 quý** | Xem ô **Đã hoàn thành**. Sinh viên đang chơi chưa lên bảng |
| Ô điểm hiện "—" | Chưa có ai hoàn thành để tính trung bình | Chờ |

### Quản trị viên

| Thông báo | Nghĩa là gì | Làm gì |
|---|---|---|
| *Bạn không thể tự thay đổi vai trò của chính mình* | Ràng buộc chống tự khoá quyền | Nhờ một quản trị viên khác, nếu thật sự cần |
| Không đăng nhập được bằng email bootstrap | `BOOTSTRAP_ADMIN_EMAIL` chỉ áp dụng cho **tài khoản mới** — nó không đổi vai trò của tài khoản đã tồn tại | Xem [DEPLOY.md](./DEPLOY.md) |

### Lỗi kỹ thuật

| Hiện tượng | Nguyên nhân | Xem |
|---|---|---|
| Đăng nhập Google bật popup rồi tự đóng | Tên miền Cloud Run chưa được cho phép trong Firebase Auth | [DEPLOY.md](./DEPLOY.md) mục 8 |
| Trang báo *"The query requires an index"* | Thiếu composite index trong Firestore | [DEPLOY.md](./DEPLOY.md), phần Troubleshooting |
| Bảng xếp hạng báo lỗi kèm link console dài | Index đang được tạo (mất vài phút) | Chờ, hoặc bấm link để tạo index |

---

## Câu hỏi hay gặp

**Sinh viên chơi lại bài chính thức được không?**
Chỉ khi giảng viên đặt "Số lần làm tối đa" lớn hơn 1. Khuyến nghị để **1**.
Chơi thử thì không giới hạn.

**Tại sao em luôn xếp thứ 6 dù điểm cao?**
Nếu bài tập dùng `smartwatch-v1` thì đó là đặc tính của kịch bản, không phải
bạn chơi kém: năm benchmark khởi đầu hơn 30–40 điểm ở bốn năng lực và cũng đầu
tư 100 điểm mỗi quý. Thứ được chấm là **Điểm tổng kết** và **hạng trong lớp**.
Xem mục B4.

**Hai sinh viên ra quyết định giống nhau có ra kết quả giống nhau không?**
Trong cùng một bài tập — **có, giống hoàn toàn**. Đó là lý do seed dùng chung.

**Xem được đối thủ đầu tư bao nhiêu điểm không?**
Sinh viên: không. Chỉ nhận nhận định định tính. Giảng viên: có, qua
**/sim-test**.

**Đổi ngôn ngữ giữa lúc chơi có mất dữ liệu không?**
Không. Ngôn ngữ chỉ ảnh hưởng chữ trên màn hình.

**Đóng trình duyệt giữa game thì sao?**
Không sao. Mọi quý đã nộp đều đã lưu trên server. Quay lại Trang chủ và bấm
**Tiếp tục**.

**Bao nhiêu sinh viên chơi cùng lúc được?**
Một lớp 60 sinh viên chơi đồng thời nằm gọn trong hạn mức miễn phí của
Firestore và Cloud Run. Xem phần Chi phí trong [DEPLOY.md](./DEPLOY.md).
