# Hướng dẫn sử dụng — Smartwatch CEO Challenge

Tài liệu này dành cho người **dùng** app. Nếu bạn cần cài đặt / triển khai app
lên Google Cloud, xem [DEPLOY.md](./DEPLOY.md).

Giao diện có **tiếng Việt và tiếng Anh**; đổi bằng nút ngôn ngữ ở góc phải
thanh trên cùng. Mặc định là tiếng Việt.

---

## Mục lục

- [Hiểu game trong 2 phút](#hiểu-game-trong-2-phút)
- [Ba vai trò và quyền hạn](#ba-vai-trò-và-quyền-hạn)
- [Thứ tự triển khai lần đầu](#thứ-tự-triển-khai-lần-đầu)
- [A. Hướng dẫn cho SINH VIÊN](#a-hướng-dẫn-cho-sinh-viên)
- [B. Hướng dẫn cho GIẢNG VIÊN](#b-hướng-dẫn-cho-giảng-viên)
- [C. Hướng dẫn cho QUẢN TRỊ VIÊN](#c-hướng-dẫn-cho-quản-trị-viên-admin)
- [D. CHẾ ĐỘ NHÓM — 6 sinh viên cạnh tranh nhau](#d-chế-độ-nhóm--6-sinh-viên-cạnh-tranh-nhau)
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
| **Sinh viên** (STUDENT) | Trang chủ | Chơi thử, làm bài tập chính thức, **vào nhóm thi đấu**, xem báo cáo của mình, xem bảng xếp hạng **lớp mình** |
| **Giảng viên** (INSTRUCTOR) | + Bảng điều khiển giảng viên, Chế độ kiểm thử mô phỏng | Tạo và **sửa** lớp, mở/đóng ghi danh, sửa mã SV, gỡ sinh viên, tạo và sửa bài tập **cá nhân hoặc nhóm**, **điều hành các nhóm** (phát mã, chạy ép vòng, gỡ sinh viên khỏi chỗ ngồi), lưu trữ, xem chi tiết 6 quý của từng SV **và của cả nhóm**, xuất CSV |
| **Quản trị viên** (ADMIN) | + Quản trị hệ thống, Người dùng | **Tạo tài khoản**, **đặt lại mật khẩu**, mời giảng viên theo email, đổi vai trò, vô hiệu hoá tài khoản, chuyển lớp sang giảng viên khác, xem **tất cả** lớp học và **mọi nhóm đang kẹt**, xem cấu hình engine |

**Mọi tài khoản mới đăng nhập đều là Sinh viên**, trừ hai ngoại lệ: email đặt ở
`BOOTSTRAP_ADMIN_EMAIL` (thành Quản trị viên, để lần deploy đầu tiên có người đủ
quyền), và email đã được quản trị viên **mời trước** (nhận đúng vai trò được mời
ngay lần đăng nhập đầu).

---

## Thứ tự triển khai lần đầu

| # | Ai làm | Việc |
|---|---|---|
| 1 | Quản trị viên | Đăng nhập bằng email đã đặt ở `BOOTSTRAP_ADMIN_EMAIL` |
| 2 | Quản trị viên | **Người dùng** → nhập email đồng nghiệp, chọn **Giảng viên**, bấm **Gửi lời mời** |
| 3 | Giảng viên | Đăng nhập lần đầu — **đã có quyền Giảng viên ngay** |
| 4 | Giảng viên | Tạo lớp, rồi bật **Cho sinh viên tự tham gia lớp này** |
| 5 | **Sinh viên** | Tự đăng ký, vào **Tham gia lớp học**, chọn lớp, nhập mã sinh viên |
| 6 | Giảng viên | Kiểm danh sách, sửa mã sinh viên nhập sai, rồi **tắt ghi danh** |
| 7 | Giảng viên | Tạo bài tập (seed, hạn cuối, số lần làm) |

> **Đã bỏ được cái bẫy cũ.** Trước đây giảng viên phải chờ sinh viên đăng nhập
> một lần rồi mới thêm được vào lớp, và quản trị viên cũng phải chờ giảng viên
> đăng nhập rồi mới nâng quyền được. Giờ **không phải chờ ai cả**: lời mời gán
> vai trò trước, và sinh viên tự vào lớp.

### Thực tế nên làm thế nào

Gửi cả lớp một câu: *"Vào link này, tự đăng ký, chọn đúng lớp [tên lớp], nhập mã
sinh viên của em."* Xong buổi đầu thì **tắt ghi danh** — từ đó không ai vào thêm
được nữa.

## A. Hướng dẫn cho SINH VIÊN

### A1. Đăng nhập

1. Mở link app do giảng viên cung cấp.
2. Chọn **Đăng nhập với Google** (dùng email trường), hoặc dùng **Email / Mật
   khẩu** — chưa có thì bấm *"Chưa có tài khoản? Tạo mới"* (mật khẩu tối thiểu
   6 ký tự).
3. Vào **Trang chủ**.

**Quên mật khẩu?** Bấm link ngay dưới form đăng nhập, nhập email, hệ thống gửi
link đặt lại vào hộp thư của bạn. Nhớ xem cả thư rác.

> Thông báo sau khi gửi **giống hệt nhau** dù email đó có tài khoản hay không.
> Đây là chủ ý: nếu khác nhau, ai cũng có thể gõ email vào để dò xem người nào
> có tài khoản trong trường.

Nếu bạn đăng nhập bằng **Google** thì không có mật khẩu để đặt lại — cứ dùng nút
**Đăng nhập với Google**. Nếu vẫn kẹt, nhờ quản trị viên đặt lại hộ.

### A2. Tham gia lớp của bạn

Đăng nhập xong, nếu chưa ở lớp nào bạn sẽ thấy nút **Tìm lớp để tham gia**.

1. Mở **Tham gia lớp học**.
2. Trong **Các lớp đang mở ghi danh**, tìm đúng lớp của bạn — mỗi dòng có tên
   lớp, học kỳ và **tên giảng viên**, dùng để phân biệt các lớp trùng tên.
3. Nhập **mã sinh viên** của bạn rồi bấm **Tham gia lớp**.

Vài điều cần biết:

- **Nhập đúng mã sinh viên.** Đây là thứ dùng để ghép điểm của bạn với danh sách
  lớp. Nhập sai thì báo giảng viên sửa giúp — giảng viên sửa được.
- **Mỗi mã chỉ một người trong một lớp.** Nếu báo *"Mã sinh viên này đã có người
  dùng trong lớp"* thì kiểm tra lại mã của mình.
- **Không thấy lớp?** Giảng viên chưa bật ghi danh, hoặc đã tắt sau khi lớp đủ
  người. Liên hệ giảng viên.
- **Rời lớp** được, nhưng chỉ khi bạn **chưa bắt đầu bài tập chính thức** nào của
  lớp đó. Bắt đầu rồi thì phải nhờ giảng viên gỡ.

### A3. Chơi thử trước (khuyến nghị mạnh)

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

### A4. Thành lập công ty

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

### A5. Bảng điều khiển CEO

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

### A6. Ra quyết định (màn hình quan trọng nhất)

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

**Bước 4 — Đọc gợi ý chiến lược.** Ngay dưới ô nhập, app đưa **ba hướng đi**
cho quý này, kèm lý do: bắt sóng sự kiện, vá điểm yếu, giao được hàng đã, đánh
vào giá, giữ biên lợi nhuận hoặc giữ nguyên đà — tuỳ tình hình công ty bạn.
Bấm một phương án là điền thẳng vào 5 ô, bạn vẫn sửa lại được.

> Đây là gợi ý **theo kinh nghiệm**, không phải đáp án. Chúng cho bạn một điểm
> xuất phát để suy nghĩ.

**Bước 5 — Chiến lược vàng (2 lần cho cả lượt chơi).** Nút này thử **hàng
nghìn tổ hợp** trên chính engine mô phỏng và trả về phương án cho **lợi nhuận
cao nhất ngay trong quý đó**, kèm giải thích và so sánh với phân bổ cân bằng.

Ba điều cần biết trước khi bấm:

1. **Chỉ có 2 lượt cho cả 6 quý** — dùng cho quý bạn thực sự bí. Hỏi lại **cùng
   một quý** (bấm nhầm, tải lại trang) thì **không tốn thêm lượt**.
2. Nó tối ưu cho **quý trước mắt**, **không** tối ưu điểm cuối kỳ. Đầu tư vào
   sản phẩm và công nghệ chủ yếu sinh lợi ở các quý sau, nên nó thường mua ít
   hơn mức bạn cần cho đường dài. App hiện rõ phần **năng lực bị đánh đổi** —
   hãy đọc phần đó, đừng chỉ chép con số.
3. **Giảng viên nhìn thấy** bạn đã dùng ở quý nào — trên màn hình chi tiết sinh
   viên, trong báo cáo và trong file CSV xuất ra.

**Bước 6 — Xem cảnh báo rủi ro.** Nếu phân bổ của bạn có rủi ro đã biết
(marketing chạy trước phân phối, giá cao khi thương hiệu còn thấp, bỏ trống một
lĩnh vực nhiều quý liền…), app nêu **cơ chế** dẫn tới rủi ro đó ngay phía trên
nút gửi. Đây là **cảnh báo, không phải chặn** — nút gửi vẫn bật, quyết định vẫn
là của bạn.

**Bước 7 — Bấm "Chốt quyết định và mô phỏng thị trường".**

> Quyết định **bị khoá sau khi gửi và không thể sửa lại**. Hệ thống cố tình
> không cho xem trước lợi nhuận.

### A7. Đọc kết quả quý

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
- **Nhận xét quyết định quý này** — ngay dưới phần tin tình báo. Đây là phần
  đáng đọc nhất: app đối chiếu phân bổ của bạn với **trọng số nhu cầu thật** của
  quý đó và nói thẳng bạn lệch ở đâu, mất bao nhiêu và vì sao. Ví dụ: *"Phân bổ
  của bạn chỉ khớp 58% với trọng số nhu cầu quý này; thiếu nhiều nhất là phân
  phối."* Tin xấu được xếp lên đầu.

Toàn bộ nhận xét sinh ra bằng **luật cố định từ chính số liệu của bạn** — không
dùng AI, và giảng viên tái lập được từng câu.

Bấm **Sang quý tiếp theo** và lặp lại từ A6 cho tới Q6.

### A8. Lịch sử chiến lược

Vào bất cứ lúc nào từ Bảng điều khiển. Gồm:

- **Bảng quyết định Q1–Q6** — mọi phân bổ và chỉ số giá của bạn.
- **Bảng kết quả Q1–Q6**.
- **Biểu đồ diễn biến**: Doanh thu, Lợi nhuận ròng, Thị phần, Năng lực theo quý.

Dùng trang này trước mỗi quyết định để thấy xu hướng, đừng chỉ nhìn quý gần nhất.

### A9. Báo cáo tổng kết

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

**Tổng kết nhiệm kỳ CEO** — đánh giá cả 6 quý trên ba trục mà một CEO thật sự
bị đánh giá:

| Trục | Trả lời câu hỏi |
|---|---|
| **Tính nhất quán** | Bạn giữ một đường lối, hay đổi hướng mỗi quý? |
| **Khả năng thích ứng** | Phân bổ của bạn có dịch chuyển theo sự kiện từng quý không? |
| **Quỹ đạo** | Công ty lúc bàn giao tốt hơn hay kém hơn lúc nhận? |

Kèm **một dòng nhận xét cho từng quý**, quý tốt nhất và quý kém nhất.

**Vị trí trong lớp** — ngoài thứ hạng, báo cáo cho biết bạn xếp trên bao nhiêu
phần trăm số bài đã nộp (*Nhóm 10% dẫn đầu*, *Nửa trên của lớp*…). Phần này chỉ
hiện khi lớp có **từ 4 bài nộp trở lên**, để không lộ danh tính ai trong lớp quá
nhỏ.

**Lẽ ra nên làm gì** — bấm nút để app tính lại cả 6 quý: quyết định của bạn đặt
cạnh phương án tốt nhất cho **chính quý đó**, trên **đúng thị trường bạn đã
gặp**, kèm khoảng cách lợi nhuận từng quý và tổng cả nhiệm kỳ.

> Mục này **chỉ mở sau khi bạn đã hoàn thành đủ 6 quý**. Đang chơi dở thì không
> truy cập được — nếu không, đây sẽ là đường vòng để lấy đáp án giữa bài.

**In / Lưu PDF** — nút ở cuối báo cáo mở hộp thoại in của trình duyệt. Bản in
tự chuyển sang **nền trắng chữ đen**, bỏ hết nút bấm, không ngắt trang giữa một
khối, và thêm dòng đầu trang ghi họ tên, công ty, mã phiên, phiên bản kịch bản /
engine và các quý đã dùng Chiến lược vàng — đủ để nộp bản giấy.

### A10. Bảng xếp hạng lớp

Vào từ Trang chủ (sau khi hoàn thành bài tập) hoặc từ Báo cáo.

- Chỉ so sánh **trong cùng một bài tập**, cùng phiên bản kịch bản và engine —
  vì chỉ khi đó kết quả mới thực sự so sánh được.
- Chỉ liệt kê sinh viên **đã hoàn thành đủ 6 quý**.
- Bạn chỉ xem được bảng của **lớp mình**.
- Đồng điểm xét theo thứ tự: **lợi nhuận luỹ kế → thị phần → nhận biết thương
  hiệu**.

### A11. Vài lời khuyên chiến lược

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

### B2. Cho sinh viên vào lớp

Mở lớp bằng nút **Thành viên · Tạo bài tập mới**.

**Cách thường dùng — để sinh viên tự vào:**

1. Ở khung **Sửa**, bật **Cho sinh viên tự tham gia lớp này**.
2. Gửi link app cho cả lớp và nói rõ tên lớp cần chọn.
3. Sinh viên tự đăng ký, chọn lớp, nhập mã sinh viên của họ.
4. Xong buổi đầu, **tắt lại công tắc đó**. Từ đó không ai vào thêm được.

> **Nên tắt sau khi lớp đã đủ.** Khi đang bật, bất kỳ ai đăng nhập được cũng vào
> được lớp này. Bật đầu kỳ, tắt sau tuần đầu là đủ an toàn cho thực tế lớp học.

**Cách thêm tay** (dùng cho một vài trường hợp lẻ): ở khung **Thành viên**, nhập
email và mã sinh viên rồi bấm **Thêm sinh viên**. Cách này vẫn yêu cầu sinh viên
**đã đăng nhập ít nhất một lần**, vì nó tìm theo tài khoản đã có.

**Sửa và gỡ.** Mỗi dòng trong bảng có nút **Sửa** (đổi mã sinh viên nhập sai) và
**Gỡ khỏi lớp**. Gỡ không xoá dữ liệu: sinh viên đã chơi vẫn còn nguyên trong
bảng theo dõi và trên bảng xếp hạng, chỉ được đánh dấu **Đã gỡ khỏi lớp**. Bấm
**Khôi phục** để cho vào lại.

**Đổi tên lớp, đổi học kỳ, lưu trữ lớp** — đều ở khung **Sửa** trên cùng trang.
Lưu trữ chỉ ẩn lớp khỏi các danh sách; điểm, bảng xếp hạng và CSV không đổi gì.

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

**Chiến lược vàng — điều bạn cần biết khi chấm.** Sinh viên có **2 lượt mỗi
lượt chơi** để yêu cầu app tìm phương án tối ưu cho một quý, và điều này áp
dụng cho **cả bài luyện tập lẫn bài chính thức**.

> Nói thẳng: hai sinh viên cùng 78 điểm **không còn so sánh trực tiếp được
> nữa** nếu một người dùng huấn luyện viên 2 quý và người kia không dùng lần
> nào. Hãy nhìn cột này trước khi xếp hạng.

App ghi lại và hiển thị điều đó ở ba nơi:

- **Nhãn ngay cạnh tên** trên trang chi tiết sinh viên — ví dụ *"Đã dùng Chiến
  lược vàng ở quý 2, 4"*.
- **Đầu trang bản in** báo cáo tổng kết của sinh viên.
- **Hai cột trong file CSV** điểm đánh giá, và **một cột đánh dấu từng quý**
  trong file CSV bảng quyết định.

Gợi ý cách dùng trên lớp: cho phép dùng thoải mái ở **bài luyện tập**, và coi
số lượt đã dùng ở **bài chính thức** như một dữ kiện để đối thoại — *"quý 4 em
dùng gợi ý, vậy em rút ra điều gì từ nó?"* — thay vì như một hình phạt.

### B6. Xuất CSV

Hai nút ở trang chi tiết bài tập:

| Nút | Nội dung | Dùng để |
|---|---|---|
| **Xuất CSV · Điểm đánh giá** | Một dòng mỗi sinh viên hoàn thành: mã SV, tên, email, công ty, 5 điểm thành phần, Điểm tổng kết, doanh thu/lợi nhuận luỹ kế, thị phần, thương hiệu, CSAT, tiền mặt, hạng game, thời điểm hoàn thành, **số lượt Chiến lược vàng đã dùng** và **các quý đã dùng** | **Nhập vào bảng điểm** |
| **Xuất CSV · Bảng quyết định Q1–Q6** | Một dòng mỗi sinh viên mỗi quý: 5 điểm đầu tư, chỉ số giá, toàn bộ KPI kết quả, và **cờ đánh dấu quý đó có dùng Chiến lược vàng hay không** | Phân tích sâu, nghiên cứu, thảo luận trên lớp |

File CSV mở trực tiếp bằng Excel hoặc Google Sheets.

> Hai cột Chiến lược vàng được thêm vào **cuối** file, sau `completed_at`. Bảng
> tính cũ của bạn khoá theo vị trí cột vẫn chạy đúng — không có cột nào bị dịch.

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

### C1. Người dùng — mời, phân vai trò, vô hiệu hoá

Menu **Người dùng** là nơi làm gần hết việc quản trị.

**Mời giảng viên theo email — không cần họ đăng nhập trước.** Nhập email, chọn
**Giảng viên**, bấm **Gửi lời mời**. Khi người đó đăng nhập lần đầu là đã có
quyền ngay. Lời mời chưa dùng hiện trong bảng và **thu hồi** được.

Vài quy tắc đáng biết, vì chúng được thiết kế có chủ ý:

- **Lời mời chỉ dùng được một lần**, và chỉ áp cho **tài khoản mới**. Nếu email
  đó đã có tài khoản, hệ thống đổi vai trò luôn thay vì tạo lời mời.
- **Hạ quyền ai đó sẽ thu hồi lời mời của họ**, để quyền đã gỡ không âm thầm
  quay lại.
- **`BOOTSTRAP_ADMIN_EMAIL` luôn thắng.** Đây là đường vào cuối cùng nếu dữ liệu
  lời mời có sai, nên không gì ghi đè được nó.

**Tạo tài khoản trực tiếp.** Nhập email, tên hiển thị, vai trò và mật khẩu ban
đầu (tối thiểu 8 ký tự). Mật khẩu hiện **đúng một lần** trên màn hình để bạn đưa
cho người dùng — hệ thống không lưu và không xem lại được.

Việc này dành cho **trường hợp lẻ**: sinh viên không có email trường, giảng viên
khách, tài khoản demo. Sinh viên bình thường tự đăng ký và tự vào lớp được.

Nếu email đó **đã có tài khoản đăng nhập nhưng chưa có hồ sơ trong app** (dữ liệu
cũ bị lạc), hệ thống tự **nối lại** thay vì báo lỗi cụt — mật khẩu cũ của họ giữ
nguyên.

**Đặt lại mật khẩu cho người dùng.** Mỗi dòng có hai nút:

- **Đặt mật khẩu** — bạn gõ mật khẩu mới, hệ thống đặt và hiện lại để bạn đọc cho
  người dùng.
- **Tạo link đặt lại** — sinh một link dùng một lần, bạn copy gửi riêng. Cách này
  bạn **không bao giờ biết** mật khẩu của họ.

Với tài khoản đang dùng **Google**, hệ thống cảnh báo trước và chỉ đặt khi bạn xác
nhận. Đặt xong họ đăng nhập được bằng **cả hai** cách.

Cột ngày sẽ ghi **admin đặt mật khẩu lần cuối** khi nào.

> **Điều cần biết khi chọn ai làm admin:** admin đặt được mật khẩu của **bất kỳ
> ai, kể cả admin khác**, rồi đăng nhập thành người đó. Đây là hệ quả cố hữu của
> quyền này, không thiết kế tránh được. Hệ thống ghi lại ai đổi và lúc nào; mật
> khẩu thì không bao giờ lưu.

**Tìm kiếm và lọc theo vai trò** — hữu ích khi danh sách đã dài.

**Vô hiệu hoá tài khoản** (nút ở cuối mỗi dòng). Tài khoản bị vô hiệu hoá chỉ
biến mất khỏi danh sách; **mọi điểm đã chấm giữ nguyên**, và người đó **vẫn đăng
nhập được** — chủ ý, để nếu vô hiệu hoá nhầm giữa kỳ thi thì họ không mất lượt
chơi đang dở. Bạn **không tự vô hiệu hoá chính mình** được.

### C2. Lớp học — toàn hệ thống

Danh sách **tất cả** lớp của mọi giảng viên, có link vào chi tiết; lớp đã lưu trữ
được đánh dấu rõ. Quản trị viên mở được mọi lớp qua chính trang của giảng viên,
nên làm được mọi thao tác sửa / gỡ / lưu trữ ở đó.

**Chuyển lớp cho giảng viên khác** cũng làm ở đây. Chỉ chuyển được cho người đã
có vai trò Giảng viên trở lên — giao lớp cho một sinh viên sẽ khiến chính chủ
lớp không vào được nữa.

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

Đầu mỗi học kỳ: vào **Người dùng**, mời giảng viên theo email. Hết — họ tự đăng
nhập là có quyền, và sinh viên tự vào lớp.

---

---

## D. CHẾ ĐỘ NHÓM — 6 sinh viên cạnh tranh nhau

Phần A–C ở trên nói về **chế độ cá nhân**: mỗi sinh viên điều hành 1 công ty, cạnh
tranh với 5 đối thủ máy. Chế độ nhóm thay 5 đối thủ máy đó bằng **5 bạn cùng lớp**.

Mọi thứ khác giữ nguyên: cùng engine, cùng 6 sự kiện thị trường, cùng công thức
điểm, cùng màn hình quyết định.

### D1. Vì sao phải có kịch bản riêng

Đây là điều quan trọng nhất cần hiểu về chế độ nhóm.

Trong kịch bản cá nhân, 6 chỗ ngồi **cố ý** khởi đầu rất khác nhau, vì 5 trong số
đó là các thương hiệu benchmark mà sinh viên đang thách thức:

| Chỗ ngồi | Thương hiệu | Sản phẩm | Phân phối |
|---|---|---|---|
| Người chơi | **30** | **50** | **40** |
| Apple | 90 | 88 | 90 |

Thả 6 người thật vào 6 chỗ đó thì ván đấu do **chỗ ngồi** quyết định, không phải do
quyết định của các em. Đo thực tế: 6 chiến lược **giống hệt nhau** kết thúc chênh
nhau **24,05 điểm**.

Nên bài tập nhóm luôn dùng kịch bản **`smartwatch-v1-arena`**, nơi **cả 6 chỗ ngồi
khởi đầu giống hệt nhau**. Cũng 6 chiến lược giống nhau ấy giờ chênh nhau
**0,23–0,44 điểm** — phần dư là nhiễu cầu ±2%, giống nhau ở mọi nhóm.

> Hệ thống **không cho chọn** kịch bản khi bạn tạo bài tập nhóm. Đây không phải sở
> thích, nên không phải một ô chọn.

### D2. Sinh viên — vào nhóm và thi đấu

**Bước 1 — Nhận mã nhóm.** Giảng viên đưa cho nhóm bạn một mã 6 ký tự. Mã không
chứa các ký tự dễ nhầm (không có 0/O/Q, 1/I/L/J, 2/Z, 5/S, 8/B, U/V).

**Bước 2 — Vào nhóm.** Trang chủ → bài tập nhóm → **Vào nhóm**, hoặc mở thẳng
`/group/join`. Nhập mã, đặt tên công ty, tên sản phẩm và định vị.

> Bạn phải **đã ở trong lớp** mới vào được. Mã bị lộ ra ngoài lớp không phải là
> đường vào — hệ thống kiểm tra danh sách lớp, không kiểm tra mã.

**Bước 3 — Phòng chờ.** Bạn thấy đủ 6 chỗ ngồi, ai đã vào, ai đã nộp quyết định
quý này, và **đang chờ đích danh ai**.

**Bước 4 — Ra quyết định.** Giống hệt màn hình cá nhân, cộng ba công cụ mới ở D3.
Nộp xong quay lại phòng chờ.

**Bước 5 — Vòng chạy khi đủ 6 người nộp.** Không có hạn giờ tự động. Người **cuối
cùng** nộp là người mà thao tác của họ chạy thị trường; 5 người kia bấm **Kiểm tra
lại** để thấy kết quả.

**Bước 6 — Đọc kết quả.** Như chế độ cá nhân, cộng bảng đối thủ trong nhóm.

**Bước 7 — Sau quý 6**, bạn có báo cáo riêng: điểm 5 thành phần, **hạng trong
nhóm**, khoảng cách với người dẫn đầu, vị trí trong lớp, Tổng kết nhiệm kỳ CEO,
biểu đồ 6 công ty qua 6 quý, và nút In.

#### Bạn thấy gì về 5 người kia

| | Bạn thấy |
|---|---|
| Thị phần, sản lượng, doanh thu, lợi nhuận, mức hài lòng, thứ hạng | ✅ |
| Giá bán trung bình (= doanh thu ÷ sản lượng) | ✅ suy ra được |
| Nhận định định tính (*"X đã quyết liệt hơn về giá"*) | ✅ |
| **5 mức phân bổ điểm của họ** | ❌ **không bao giờ** |

Đúng như thị trường thật: giá và kết quả kinh doanh thì công khai, còn **họ đã đầu
tư bao nhiêu vào đâu thì không**.

### D3. Ba công cụ thay cho Chiến lược vàng

> **Chế độ nhóm KHÔNG có nút Chiến lược vàng.** Ở chế độ cá nhân nút đó tìm được
> phương án tối ưu vì nó biết trước quyết định của 5 đối thủ máy. Với 5 người thật,
> quyết định của họ **chưa tồn tại** lúc bạn đang cân nhắc — không có phép tính nào
> để chạy. Chúng tôi nói thẳng điều đó thay vì làm giả một đáp án.

**Đọc vị đối thủ** — tối đa 4 nhận định rút từ quý trước, ví dụ *"3 đối thủ đã hạ
giá; quý này giá chiếm 30% quyết định mua — hạ giá theo là cuộc đua xuống đáy"*.
Toàn bộ dữ liệu là những gì bạn **đã nhìn thấy**, nên bạn tự kiểm chứng được.

**Bản đồ vị thế** — 6 công ty xếp theo giá bán và mức hài lòng. Chỗ nào đông là
chỗ đang chen chúc; chỗ nào trống là khoảng hở.

**Bàn thử nghiệm** — thử một phân bổ và xem mô hình phản ứng thế nào.

> Đối thủ trên bàn thử nghiệm là **5 bản sao của chính công ty bạn**, cùng chơi
> 20/20/20/20/20. Cố ý như vậy: nếu dùng số liệu thật của bạn cùng nhóm, bạn có thể
> thử đi thử lại để **dò ngược ra quyết định của họ**. Nó trả lời *"mô hình này
> thưởng cho điều gì"*, **không phải** *"tôi sẽ thắng hay thua"*.

### D4. Giảng viên — tạo và điều hành

**Tạo bài tập nhóm.** Trang lớp → **Bài tập mới** → Hình thức: **Nhóm** → nhập số
nhóm cần tạo. Hệ thống tạo sẵn các nhóm rỗng, mỗi nhóm một mã. Ô "số lần làm bài"
biến mất: bài nhóm là **một ván đấu chung**, không phải một tập lượt thử.

**Phát mã.** Trang chi tiết bài tập → tab **Nhóm**. Mỗi dòng có mã tham gia, số
người, tiến độ, **đang chờ ai**.

**Khi một nhóm bị kẹt.** Đây là mặt trái của việc không có hạn giờ tự động, nên
công cụ nằm ngay trên dòng bị kẹt:

| Nút | Làm gì |
|---|---|
| **Chạy vòng ngay** | Chạy vòng với quyết định mặc định cho ai chưa nộp. Mặc định **lặp lại quyết định quý trước của chính họ** (quý 1 thì dùng 20/20/20/20/20), và **được gắn cờ** trong báo cáo |
| **Gỡ khỏi nhóm** | Chỗ ngồi đó chuyển cho máy, ván đấu chạy tiếp với 5 người |
| **Đổi mã** | Cấp mã mới, mã cũ hết hiệu lực ngay |

**Xem chi tiết nhóm** — đây là màn hình **duy nhất** trong cả hệ thống hiện **phân
bổ điểm chính xác của cả 6 công ty**, cạnh nhau, theo từng quý. Đó là cách bạn trả
lời *"vì sao công ty kia thắng?"* trước lớp. Bản nộp mặc định được đánh dấu — đừng
thảo luận nó như thể sinh viên đó đã tự chọn.

Đầu trang chi tiết nhóm là bảng **Trạng thái nộp quyết định** của quý đang chạy —
đúng những gì sinh viên thấy trong phòng chờ của các em, cộng thêm **giờ nộp**, và
nút **Chạy vòng ngay** / **Gỡ khỏi nhóm** ngay tại đó. Bạn không phải quay lại tab
Nhóm để xử lý một nhóm đang mở.

> **Nội dung quyết định chỉ hiện SAU KHI quý đã chạy.** Trước đó bảng chỉ nói ai
> đã nộp và lúc mấy giờ. Đây là chủ ý: giảng viên hay chiếu màn hình lên lớp, và
> nếu hiện phân bổ của người nộp sớm thì cả phòng nhìn thấy — người nộp sau sẽ có
> lợi thế mà chính chế độ nhóm sinh ra để loại bỏ.

Bảng xếp hạng trên trang này ghi **"tạm tính"** cho tới khi đủ 6 quý. Chưa đủ 6 quý
thì thứ hạng còn đổi — **đừng chấm điểm trên bảng tạm tính**.

Trang này cũng **đổi tên nhóm** và **lưu trữ nhóm** được. Lưu trữ là xoá mềm: ván
đấu đã chơi không bao giờ bị xoá thật, chỉ ẩn khỏi danh sách.

**Chấm điểm.** Không có gì mới phải học: nhóm kết thúc sẽ ghi **6 dòng điểm bình
thường**, nên bảng xếp hạng lớp, phần trăm vị trí và cả hai file CSV cũ chạy y
nguyên. `Hạng trong game` **chính là hạng 1–6 trong nhóm**.

Có thêm file CSV thứ ba — **Bảng quyết định nhóm** — một dòng mỗi công ty mỗi quý,
kèm phân bổ chính xác, tên nhóm, chỗ ngồi và cờ bản nộp mặc định.

> Điểm là **tuyệt đối**, không chuẩn hoá theo nhóm, nên so sánh được toàn lớp bất kể
> em đó ở nhóm nào. Mọi nhóm của cùng một bài tập dùng chung seed, nên gặp cùng sự
> kiện và cùng nhiễu thị trường.

### D5. Quản trị viên

Admin đi vòng qua kiểm tra sở hữu ở mọi nơi nên thấy và sửa được mọi nhóm.

Riêng trang `/admin` có thêm một mục: **Nhóm đang kẹt** — mọi nhóm trong toàn hệ
thống chưa tiến triển quá 7 ngày vì còn chờ quyết định, kèm tên người đang thiếu.
Giảng viên thấy nhóm kẹt của lớp mình; mục này để **không lớp nào kẹt mà không ai
biết**.

### D6. Lớp không chia hết cho 6

Không cần xử lý gì. Nhóm thiếu người thì **chỗ trống do máy điều khiển** — luôn đủ
6 công ty trên thị trường, giao diện ghi rõ công ty nào là máy, và **không ai bị
chấm điểm cho chỗ ngồi đó**.

Máy chơi theo một khuôn cố định, nên đó cũng là đối thủ duy nhất sinh viên đoán
trước được — công cụ Đọc vị đối thủ nói thẳng điều này.

### D7. Vài điều cần biết trước khi dùng thật

- **Chỗ ngồi đóng băng ngay khi thị trường chạy lần đầu.** Trước đó sinh viên ra
  vào tự do; sau đó thì không nhận thêm người. Hãy để cả nhóm vào đủ rồi mới bắt đầu.
- **Nộp rồi không sửa được.** Năm người kia đang chờ đúng quyết định đó.
- **Một sinh viên chỉ ở một nhóm của một bài tập.** Muốn đổi nhóm thì giảng viên
  gỡ ra trước.

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
| *Bạn chưa tham gia lớp nào* | Chưa vào lớp | Bấm **Tìm lớp để tham gia**, chọn lớp, nhập mã SV |
| *Hiện chưa có bài tập nào được giao cho bạn* | Đã ở trong lớp nhưng lớp chưa có bài tập | Chờ giảng viên tạo bài tập |
| *Mã sinh viên này đã có người dùng trong lớp* | Mã bị trùng trong cùng lớp | Kiểm tra lại mã của mình; nếu đúng là mã của bạn thì báo giảng viên |
| *Hiện chưa có lớp nào mở ghi danh* | Giảng viên chưa bật, hoặc đã tắt ghi danh | Liên hệ giảng viên |
| *Bạn đã bắt đầu bài tập chính thức của lớp này nên không tự rời được* | Đã có lượt chơi chính thức | Nhờ giảng viên gỡ |
| Quên mật khẩu, không nhận được email | Email sai, hoặc thư vào hộp rác, hoặc bạn đăng nhập bằng Google | Kiểm tra thư rác; nếu dùng Google thì bấm **Đăng nhập với Google** |
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
| *Không tìm thấy người dùng với email này. Sinh viên cần đăng nhập ít nhất 1 lần.* | Chỉ xảy ra khi **thêm tay**. Tài khoản chưa tồn tại | Dùng cách để sinh viên tự vào lớp (bật ghi danh), hoặc nhắc họ đăng nhập một lần rồi thêm lại |
| Sinh viên báo không thấy lớp | Chưa bật **Cho sinh viên tự tham gia lớp này**, hoặc đã tắt | Bật lại ở khung **Sửa** của trang lớp |
| Trong bảng theo dõi, *Đã hoàn thành* nhiều hơn *Đang trong lớp* | Có sinh viên đã chơi rồi bị gỡ khỏi lớp | Đúng như thiết kế. Người đã chơi luôn được giữ lại trong bảng, đánh dấu **Đã gỡ khỏi lớp** |
| *Bạn không có quyền truy cập trang này* | Chưa được phong Giảng viên, hoặc đang mở lớp của người khác | Nhờ Quản trị viên phong vai trò. Giảng viên chỉ thấy lớp của mình |
| Bảng xếp hạng trống | Chưa ai hoàn thành đủ **6 quý** | Xem ô **Đã hoàn thành**. Sinh viên đang chơi chưa lên bảng |
| Ô điểm hiện "—" | Chưa có ai hoàn thành để tính trung bình | Chờ |

### Quản trị viên

| Thông báo | Nghĩa là gì | Làm gì |
|---|---|---|
| *Bạn không thể tự thay đổi vai trò của chính mình* | Ràng buộc chống tự khoá quyền | Nhờ một quản trị viên khác, nếu thật sự cần |
| *Mật khẩu cần ít nhất 8 ký tự* | Mật khẩu quá ngắn | Đặt mật khẩu dài hơn |
| *Email này đã có tài khoản* | Người đó đã có trong danh sách | Sửa trực tiếp trên dòng của họ thay vì tạo mới |
| *Tài khoản này đang đăng nhập bằng Google…* | Chưa có mật khẩu | Bấm **Tôi hiểu, vẫn đặt mật khẩu** nếu thật sự muốn |
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

**Sinh viên quên mật khẩu thì làm sao?**
Tự bấm **Quên mật khẩu?** ở trang đăng nhập là xong — không cần ai giúp. Nếu vẫn
kẹt, admin đặt lại hộ hoặc tạo link đặt lại.

**Admin có xem được mật khẩu của sinh viên không?**
Không. Hệ thống không lưu mật khẩu ở dạng đọc được. Admin chỉ **đặt mật khẩu
mới** (và thấy đúng cái mình vừa gõ), hoặc **tạo link** để người dùng tự đặt.

**Sinh viên vào nhầm lớp thì sao?**
Nếu chưa bắt đầu bài chính thức, họ tự bấm **Rời lớp** rồi vào lớp đúng. Nếu đã
bắt đầu rồi, giảng viên gỡ giúp ở bảng thành viên.

**Lỡ lưu trữ nhầm một lớp thì có mất điểm không?**
Không. Lưu trữ chỉ ẩn lớp khỏi danh sách. Bảng xếp hạng, file CSV và báo cáo của
sinh viên không đổi một chữ. Bấm **Khôi phục** là lớp trở lại.

**Xoá hẳn được không?**
Không, và đó là chủ ý. Với app dùng để chấm điểm, một thao tác xoá không hoàn tác
được là rủi ro lớn hơn giá trị nó mang lại. Mọi thứ đều là lưu trữ, khôi phục
được.

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
