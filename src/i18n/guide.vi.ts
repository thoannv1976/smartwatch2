/**
 * Nội dung trang Giới thiệu & Hướng dẫn cho sinh viên (tiếng Việt).
 *
 * TÁCH RIÊNG KHỎI `vi.ts` VÌ ĐÂY LÀ VĂN XUÔI, KHÔNG PHẢI CHUỖI GIAO DIỆN.
 * `vi.ts` là nguồn của type `Dictionary` và chứa hàng trăm nhãn ngắn; nhồi thêm
 * vài trăm dòng văn bản dài vào đó sẽ làm nó không còn đọc được. File này được
 * spread vào `vi.ts` dưới khoá `guide`, nên KHÔNG có cơ chế mới nào: `tsc` vẫn
 * cưỡng chế `guide.en.ts` khớp hình dạng, và `tests/i18n/parity.test.ts` vẫn tự
 * động bao phủ vì nó đọc qua `getDictionary()`.
 *
 * QUY TẮC VỀ SỐ LIỆU: mọi con số trong file này phải khớp `config.ts`,
 * `formulas.ts` và `scoring.ts`. `tests/i18n/guide.test.ts` đọc các hệ số thật
 * từ config và đối chiếu, nên sửa hệ số mà quên sửa chỗ này là test đỏ.
 *
 * QUY TẮC VỀ BÀI HỌC: mỗi khoá trong `questions` phải có đúng một khoá cùng tên
 * trong `answers`. Một câu hỏi thiếu đáp án sẽ hiện thành ô trống trước cả lớp,
 * và parity test không thấy được vì nó chỉ so tiếng Việt với tiếng Anh.
 */
export const guideVi = {
  title: 'Giới thiệu & Hướng dẫn',
  subtitle: 'Bạn sắp điều hành một hãng smartwatch trong sáu quý. Đây là mọi thứ cần biết trước.',
  backHome: 'Về trang chủ',
  signIn: 'Đăng nhập',
  tocTitle: 'Nội dung',

  // --- 1. Giới thiệu -------------------------------------------------------
  intro: {
    title: 'Game này là gì',
    lead: 'Bạn là CEO của một hãng đồng hồ thông minh mới thành lập. Sáu quý, mỗi quý một quyết định, và một thị trường có năm đối thủ khác đang cạnh tranh cùng bạn.',
    body: 'Mỗi quý bạn chia đúng 100 điểm chiến lược cho năm lĩnh vực — Sản phẩm, Công nghệ, Marketing số, Phân phối, Trải nghiệm khách hàng — rồi chọn một mức giá. Thị trường chạy, kết quả hiện ra, và bạn mang năng lực vừa xây được sang quý sau. Sau sáu quý, hệ thống chấm bạn trên năm thành phần và so với cả lớp.',
    numbersTitle: 'Các con số cố định',
    numbersHint: 'Giống nhau với mọi sinh viên, mọi lớp. Đây là những gì bạn có thể tin.',
    quartersLabel: 'Số quý',
    quartersValue: '6',
    pointsLabel: 'Điểm chiến lược mỗi quý',
    pointsValue: '100 (phải chia hết, không thừa không thiếu)',
    priceLabel: 'Chỉ số giá',
    priceValue: '80–120, quanh giá tham chiếu $300',
    marketLabel: 'Quy mô thị trường nền',
    marketValue: '500.000 chiếc mỗi quý',
    cashLabel: 'Vốn ban đầu',
    cashValue: '$5.000.000',
    companiesLabel: 'Số công ty trong thị trường',
    companiesValue: '6 (bạn và 5 đối thủ)',

    deterministicTitle: 'Thị trường không may rủi',
    deterministicBody: 'Engine là tất định: cùng một seed thì cùng một thị trường, cùng một quyết định thì cùng một kết quả — hôm nay, ngày mai, hay khi giảng viên chấm lại. Có một nhiễu ngẫu nhiên ±2% sinh từ seed để thị trường không phẳng lì, nhưng nó giống nhau cho mọi người dùng chung seed. Bạn thắng hay thua vì quyết định, không vì xúc xắc.',

    honestTitle: 'Một điều cần nói thẳng trước khi bạn chơi',
    honestBody: 'Trong kịch bản mặc định, bạn khởi đầu là một startup: thương hiệu 30, sản phẩm 50, công nghệ 50, phân phối 40. Năm đối thủ là các thương hiệu lớn đã có sẵn: thương hiệu 70–90, và mọi năng lực khác đều cao hơn bạn 30–40 điểm. Họ cũng đầu tư 100 điểm mỗi quý như bạn.',
    honestConsequence: 'Hệ quả, và chúng tôi đã đo chứ không đoán: một lần quét 95.634 phương án phân bổ cho thấy người chơi về hạng 6/6 trong MỌI phương án. Thương hiệu, mức hài lòng và đổi mới chiếm 45% điểm cuối, và sáu quý không đủ để bù 30–40 điểm năng lực.',
    honestPoint: 'Vì vậy đừng lấy thứ hạng trong thị trường làm thước đo bản thân. Điểm của bạn được so với các bạn cùng lớp, không phải với năm hãng lớn trong thị trường. Khoảng cách giữa phương án tốt nhất và tệ nhất trong cùng phép quét đó là 32 điểm — đó mới là thứ được chấm, và nó hoàn toàn nằm trong tay bạn. Nếu bạn muốn một kịch bản mà chơi giỏi thì leo được lên hạng 3, hãy hỏi giảng viên về bản Challenger.',
  },

  // --- 2. Giá trị ----------------------------------------------------------
  value: {
    title: 'Game này cho bạn cái gì',
    lead: 'Không phải để giải trí, và cũng không phải để học thuộc công thức. Năm thứ dưới đây là lý do bài tập này tồn tại.',
    tradeoffTitle: 'Đánh đổi là bản chất của chiến lược',
    tradeoffBody: '100 điểm là hữu hạn. Mỗi điểm bỏ vào Marketing là một điểm không vào Phân phối. Không có phương án nào tốt ở mọi mặt, nên "chiến lược" ở đây không phải là chọn điều tốt — mà là chọn điều mình sẵn sàng đánh đổi.',
    causalTitle: 'Đọc số và truy ngược nhân quả',
    causalBody: 'Mỗi quý cho bạn một bảng số và một câu hỏi: vì sao nó ra thế? Lãi giảm vì giá, vì chi phí, hay vì trả hàng? Thị phần tăng nhưng biên lợi nhuận mỏng đi — đó là thắng hay thua? Kỹ năng này chuyển thẳng sang mọi báo cáo kinh doanh thật.',
    calibrationTitle: 'Hiệu chuẩn phán đoán',
    calibrationBody: 'Trước mỗi quý bạn phải đoán mình sẽ về hạng mấy. Không tính vào điểm, nhưng sau sáu quý bạn biết được mình thường đánh giá cao hay đánh giá thấp bản thân. Rất ít bài tập cho bạn biết điều đó về chính mình.',
    incompleteTitle: 'Quyết định khi thiếu thông tin',
    incompleteBody: 'Hệ thống cố ý không cho xem trước lợi nhuận, và bạn không bao giờ thấy phân bổ điểm của đối thủ. Bạn chốt trong tình trạng thiếu thông tin — đúng như một giám đốc thật, và khác hẳn một bài tập có đáp án ở cuối sách.',
    peopleTitle: 'Cạnh tranh với người thật',
    peopleBody: 'Ở phần 2, năm đối thủ là năm bạn cùng lớp đang đọc bạn trong khi bạn đọc họ. Không có lời giải tối ưu, vì quyết định của họ chưa tồn tại lúc bạn đang cân nhắc.',
  },

  // --- 3. Hướng dẫn chơi ---------------------------------------------------
  howTo: {
    title: 'Chơi thế nào',
    part1Title: 'Phần 1 — Chơi cá nhân',
    part2Title: 'Phần 2 — Thi đấu theo nhóm 6 người',
    stepLabel: 'Bước {n}',

    s1Title: 'Vào lớp của bạn',
    s1Body: 'Bấm "Tìm lớp để tham gia" trên trang chủ, chọn đúng lớp của mình và nhập mã sinh viên. Chưa vào lớp thì chưa thấy bài tập chính thức nào.',
    s2Title: 'Chơi thử trước — nghiêm túc khuyên bạn',
    s2Body: 'Chế độ luyện tập không giới hạn số lần và không bao giờ lên bảng xếp hạng. Chơi trọn một ván thử rồi hãy đụng vào bài tập chính thức: bài chính thức thường chỉ cho một lượt, và không có nút làm lại.',
    s3Title: 'Lập công ty',
    s3Body: 'Đặt tên công ty, tên sản phẩm, và chọn một trong sáu định vị. Định vị không thay đổi công thức — nó là tuyên bố ý định của bạn, và báo cáo cuối sẽ đối chiếu xem sáu quý bạn chơi có đúng với điều đã tuyên bố không.',
    s4Title: 'Bảng điều khiển CEO',
    s4Body: 'Nơi bạn thấy năng lực hiện tại, kết quả quý trước, bảng xếp hạng sáu công ty, và sự kiện thị trường sắp tới. Đọc sự kiện trước khi vào màn quyết định — nó cho biết quý này thị trường trả giá cao cho cái gì.',
    s5Title: 'Ra quyết định — màn hình quan trọng nhất',
    s5Body: 'Năm thanh trượt và một chỉ số giá. Nút nộp chỉ bật khi tổng đúng 100 điểm. Trên đường đi bạn có ba công cụ: 3 gợi ý chiến lược kèm lý do (bấm là điền sẵn, vẫn sửa được), Chiến lược vàng dò tìm phương án tốt nhất cho riêng quý đó — giới hạn 2 lần mỗi ván, và cảnh báo rủi ro tự cập nhật theo từng thao tác của bạn.',
    s5Warning: 'Hệ thống cố ý KHÔNG cho xem trước lợi nhuận, và quyết định KHOÁ SAU KHI NỘP. Cân nhắc kỹ trước khi bấm.',
    s6Title: 'Dự đoán của bạn',
    s6Body: 'Trước khi chốt, chọn hạng bạn nghĩ mình sẽ về — một cú bấm, bắt buộc. Có thêm hai ô không bắt buộc: thị phần bạn kỳ vọng và một câu lý do. Dự đoán không ảnh hưởng kết quả và không tính vào điểm; nó chỉ để sau này bạn đối chiếu được mình đọc thị trường sát tới đâu.',
    s7Title: 'Đọc kết quả quý',
    s7Body: 'Toàn bộ KPI kèm mức đổi so với quý trước, tin báo chí và đánh giá khách hàng về công ty bạn, dự đoán đối chiếu thực tế, nhận xét về quyết định vừa rồi, và thư của Hội đồng quản trị kèm đúng một việc nên làm ở quý sau.',
    s8Title: 'Báo cáo tổng kết',
    s8Body: 'Sau quý 6: điểm cuối và cách nó được tạo thành, tổng kết nhiệm kỳ, chỉ số đọc thị trường, vị trí trong lớp, 12 huy hiệu (kèm cả những cái chưa đạt và điều kiện của chúng), bảng đối chiếu "lẽ ra" cho từng quý, và một chứng nhận in được.',

    g1Title: 'Nhận mã nhóm',
    g1Body: 'Giảng viên phát cho nhóm bạn một mã sáu ký tự. Nhập mã, đặt tên công ty của riêng bạn, và bạn nhận một trong sáu chỗ ngồi.',
    g2Title: 'Phòng chờ',
    g2Body: 'Sáu chỗ ngồi, ai đã vào, ai đã nộp quyết định quý này, và đang chờ ai — nêu đích danh. Quý chỉ chạy khi cả sáu đã nộp, hoặc khi giảng viên bấm chạy ngay.',
    g3Title: 'Ra quyết định trong nhóm',
    g3Body: 'Cùng năm thanh trượt, cùng ba gợi ý, cùng cảnh báo rủi ro, cùng ô dự đoán. Khác một điểm lớn: nộp là chung cuộc, và năm người đang chờ bạn.',
    g4Title: 'Ba công cụ thay cho Chiến lược vàng',
    g4Body: 'Đọc vị đối thủ (nhận định dựng từ dữ liệu đã công bố), bản đồ vị thế (giá bán so với mức hài lòng của cả sáu công ty), và bàn thử nghiệm (thử một phân bổ trước khi chốt).',
    g5Title: 'Kết quả và báo cáo nhóm',
    g5Body: 'Sau mỗi quý: kết quả của bạn cộng bảng đối đầu sáu công ty. Sau sáu quý: hạng trong nhóm, khoảng cách điểm với người dẫn đầu, và biểu đồ diễn biến của cả sáu công ty.',

    goldenOffTitle: 'Vì sao Chiến lược vàng phải tắt ở chế độ nhóm',
    goldenOffBody: 'Ở chế độ cá nhân, bộ tối ưu tìm được phương án tốt nhất vì nó biết trước quyết định của năm đối thủ máy — chúng sinh ra từ seed và không phụ thuộc vào bạn. Với năm người thật, năm quyết định đó CHƯA TỒN TẠI lúc bạn đang cân nhắc. Không có cách nào làm nó đúng, và giả vờ làm được là dạy sai. Nên nút đó biến mất, và màn hình nói rõ lý do thay vì lặng lẽ giấu đi.',
  },

  // --- 4. Bài học ----------------------------------------------------------
  lessons: {
    part1Title: 'Bài học sau khi hoàn thành phần 1',
    part2Title: 'Bài học sau khi hoàn thành phần 2',
    questionsHint: 'Đây là những câu hỏi đáng mang theo trong lúc chơi. Đáp án mở ra sau khi bạn chơi xong.',
    lockedPart1: 'Đáp án mở sau khi bạn hoàn thành trọn sáu quý một ván bất kỳ — kể cả ván luyện tập.',
    lockedPart2: 'Đáp án mở sau khi bạn hoàn thành một ván nhóm sáu quý.',
    unlockedNote: 'Bạn đã chơi xong phần này, nên đáp án đã mở.',
    whyLocked: 'Vì sao khoá: nếu đọc trước rằng "phân phối là điểm nghẽn", bạn sẽ không bao giờ tự vấp vào nó — và tự vấp mới là thứ làm mô phỏng đáng giá hơn một bài đọc.',
    answerLabel: 'Điều đang xảy ra',
  },

  part1: {
    questions: {
      unitsNotVictory: 'Vì sao bán được nhiều hàng nhất vẫn có thể không phải người thắng?',
      distributionCap: 'Vì sao có quý khách muốn mua mà bạn không bán được?',
      priceNeedsBrand: 'Vì sao cùng một mức giá, công ty này bán chạy mà công ty kia thì không?',
      compounding: 'Một điểm đầu tư ở quý 1 và một điểm ở quý 6 — cái nào đáng hơn?',
      readWeights: 'Mỗi quý thị trường trả giá cao cho cái gì, và làm sao biết?',
      hiddenReturns: 'Vì sao doanh thu tốt mà lãi vẫn mỏng?',
      cashDiscipline: 'Hết tiền mặt thì chuyện gì xảy ra?',
      steadyVsAdapt: 'Nên kiên định một chiến lược hay đổi theo từng quý?',
    },
    answers: {
      unitsNotVictory: 'Vì số lượng bán không phải một thành phần nào của điểm cuối. Điểm được ghép từ năm thứ có trọng số: lợi nhuận 30%, thị phần 25%, thương hiệu 15%, mức hài lòng khách hàng 15%, đổi mới 15%. Bán rẻ thật nhiều đẩy được thị phần nhưng đánh thẳng vào lợi nhuận — thành phần nặng nhất. Một công ty bán ít hơn mà giữ được biên lợi nhuận, thương hiệu và mức hài lòng sẽ ăn điểm cao hơn.',
      distributionCap: 'Vì phân phối là một trần cứng chứ không phải một điểm cộng. Phần nhu cầu bạn phục vụ được tính bằng 0,70 + 0,003 × Phân phối, chặn trên ở 1,00. Ở mức phân phối 40 — đúng mức bạn khởi đầu — bạn chỉ phục vụ được 82% nhu cầu mình đã tạo ra. Phần còn lại là khách đã muốn mua và không mua được: doanh thu bạn đã giành được rồi nhưng không thu về. Đó là lý do dồn Marketing mà bỏ quên Phân phối là sai lầm tốn kém nhất của game này.',
      priceNeedsBrand: 'Vì giá không được đánh giá độc lập. Người mua cân sức hấp dẫn của giá cùng với sản phẩm, công nghệ, thương hiệu và trải nghiệm — và thương hiệu chiếm 20% quyết định mua ở trọng số mặc định. Đặt giá cao khi thương hiệu còn thấp nghĩa là đòi một mức phí mà bạn chưa có gì để biện minh. Ngược lại, thương hiệu mạnh cho phép bạn bán đắt mà vẫn giữ được khách.',
      compounding: 'Điểm ở quý 1 đáng hơn nhiều. Năng lực được mang sang quý sau, nên một điểm sản phẩm bỏ vào quý 1 làm việc cho bạn suốt sáu quý, còn điểm bỏ vào quý 6 chỉ làm việc đúng một lần. Đầu tư cũng có lợi suất giảm dần: cùng một điểm bỏ vào năng lực đang ở mức 30 tạo ra nhiều thay đổi hơn khi nó đã ở mức 80. Xây sớm, xây vào chỗ đang yếu.',
      readWeights: 'Sáu yếu tố quyết định mua đều có trọng số, và mặc định là: sản phẩm 30%, giá 20%, thương hiệu 20%, marketing 15%, phân phối 10%, trải nghiệm 5%. Sự kiện thị trường của từng quý làm bộ trọng số này đổi — quý cạnh tranh giá đẩy giá lên 30%, quý bùng nổ công nghệ nhân đóng góp của công nghệ lên 1,4 lần. Màn quyết định hiện trọng số của quý hiện tại, và nhận xét cuối quý cho biết phân bổ của bạn khớp với nó bao nhiêu phần trăm. Đầu tư khớp trọng số là cách rẻ nhất để ăn điểm.',
      hiddenReturns: 'Vì có hai khoản bào mòn lãi mà bảng doanh thu không nói. Thứ nhất, giá vốn tăng theo chính chất lượng và công nghệ bạn xây — sản phẩm tốt hơn thì đắt hơn để làm. Thứ hai, tỷ lệ trả hàng: 0,10 − 0,0003 × Chất lượng − 0,0003 × Trải nghiệm, nằm trong khoảng 4%–10%. Bỏ bê chất lượng và trải nghiệm nghĩa là trả mức 10% suốt sáu quý, và mỗi lần trả hàng là một lần bạn đã tốn chi phí sản xuất mà không giữ được doanh thu.',
      cashDiscipline: 'Tiền mặt là ràng buộc tuyệt đối. Mỗi quý bạn chi cố định cho đầu tư chiến lược và chi phí vận hành, bất kể bán được bao nhiêu. Một công ty hết tiền không còn lựa chọn nào nữa — kể cả những lựa chọn đúng. Bài học không phải "đừng tiêu tiền" mà là: mỗi khoản đầu tư phải có đường quay về thành doanh thu trong số quý còn lại, và ở quý 5–6 thì đường đó rất ngắn.',
      steadyVsAdapt: 'Đó là hai trục khác nhau, không phải hai đầu của một trục — và báo cáo cuối chấm cả hai riêng biệt. Nhất quán đo mức bạn đảo phân bổ giữa các quý; thích ứng đo mức phân bổ của bạn khớp với trọng số cầu của từng quý. Người giỏi nhất thường nhất quán về hướng (biết mình đang xây gì) nhưng thích ứng về chiến thuật (dịch điểm theo sự kiện). Đảo liên tục là mất phương hướng; không đổi gì suốt sáu quý là không đọc thị trường.',
    },
  },

  part2: {
    questions: {
      noOptimizer: 'Vì sao ở chế độ nhóm không thể có nút tìm phương án tốt nhất?',
      incompleteInfo: 'Bạn thực sự biết được gì về đối thủ, và không biết được gì?',
      emptySpace: 'Nên đi vào chỗ đông hay chỗ trống trên bản đồ vị thế?',
      priceWar: 'Nếu ba trên năm đối thủ vừa hạ giá, bạn nên làm gì?',
      slowestMember: 'Vì sao nhóm bạn có thể đứng im dù bạn đã nộp?',
      sameStart: 'Cả sáu công ty khởi đầu giống hệt nhau — vậy cái gì tạo ra khác biệt?',
    },
    answers: {
      noOptimizer: 'Vì lời giải tối ưu cần biết đối thủ sẽ làm gì, và ở đây năm quyết định đó chưa tồn tại. Ở chế độ cá nhân, năm đối thủ máy sinh ra từ seed và không phụ thuộc vào bạn, nên máy tính thử được mọi phương án. Với năm người thật đang cân nhắc cùng lúc với bạn — và cũng đang đoán bạn — bài toán không có đáp án cố định. Đó không phải giới hạn kỹ thuật; đó chính là điều làm cạnh tranh thật khác với một bài tối ưu hoá.',
      incompleteInfo: 'Bạn thấy tất cả những gì thị trường công bố: sản lượng, doanh thu, lợi nhuận, thị phần, mức hài lòng, thứ hạng của cả sáu công ty. Từ doanh thu chia sản lượng bạn suy ra được giá bán trung bình của họ. Bạn KHÔNG bao giờ thấy phân bổ điểm của họ, và họ cũng không thấy của bạn — kể cả bàn thử nghiệm cũng cố tình dùng năm bản sao của chính bạn, để không ai dò ngược ra được quyết định của bạn cùng nhóm. Nghề đọc thị trường ở đây là suy ra ý định từ kết quả, không phải nhìn trộm bài.',
      emptySpace: 'Chỗ trống, gần như luôn luôn. Bản đồ vị thế đặt cả sáu công ty lên hai trục giá bán và mức hài lòng. Khi ba công ty chen nhau ở cùng một góc, họ chia nhau cùng một nhóm khách và cùng kéo biên lợi nhuận của nhau xuống. Một khoảng trống nghĩa là có một nhóm khách chưa ai phục vụ. Khác biệt hoá không phải khẩu hiệu — nó là cách duy nhất để không phải cạnh tranh bằng giá.',
      priceWar: 'Gần như chắc chắn là ĐỪNG hạ theo. Khi cả thị trường cùng hạ giá, không ai giành thêm được thị phần đáng kể nhưng mọi người đều mất biên lợi nhuận — và lợi nhuận là 30% điểm cuối, thành phần nặng nhất. Cuộc đua xuống đáy có kết cục là mọi người cùng nghèo đi. Quý đó thường là quý nên đi hướng khác: chất lượng, thương hiệu, hoặc phục vụ được nhóm khách mà những người đang giảm giá bỏ rơi.',
      slowestMember: 'Vì thị trường chỉ chạy khi cả sáu chỗ ngồi đã nộp. Đây là lựa chọn có chủ ý: không có hạn giờ tự động nộp hộ bạn một quyết định bạn không chọn. Mặt trái là một người biến mất làm kẹt năm người còn lại, nên phòng chờ nêu đích danh ai đang thiếu — để cả nhóm đi tìm người đó. Giảng viên có nút chạy vòng ngay, và bản nộp thay thế sẽ được đánh dấu rõ trong báo cáo, không ai bị chấm oan. Bài học ngoài game: phối hợp là một ràng buộc thật, và nó thuộc về mọi người trong nhóm chứ không phải của riêng người chậm nhất.',
      sameStart: 'Chỉ có quyết định. Ở chế độ nhóm, cả sáu chỗ ngồi khởi đầu với cùng một dòng số y hệt nhau — thương hiệu 30, sản phẩm 50, công nghệ 50, phân phối 40, trải nghiệm 50 — và cùng $5.000.000. Đó là chủ ý: nếu dùng kịch bản cá nhân, ai được xếp vào chỗ của một thương hiệu lớn sẽ thắng vì chỗ ngồi chứ không vì chơi giỏi. Chúng tôi đã đo: với sáu chiến lược giống hệt nhau, chỗ ngồi kiểu cá nhân cho kết quả chênh 24 điểm, còn chế độ nhóm chênh dưới nửa điểm. Nên khi ván đấu kết thúc và sáu công ty cách xa nhau, khoảng cách đó là do sáu người, không do sáu xuất phát điểm.',
    },
  },

  // --- 5. Kết ---------------------------------------------------------------
  closing: {
    title: 'Một lời cuối',
    body: 'Sẽ có quý bạn làm đúng mọi thứ và vẫn tụt hạng, vì năm người khác cũng đang làm đúng. Điều đó không sai — đó là thị trường. Thứ bài tập này đo không phải bạn có thắng không, mà là bạn có hiểu vì sao kết quả ra như vậy không. Hãy dùng ô lý do ở mỗi quý: sáu câu bạn tự viết sẽ là phần giá trị nhất trong báo cáo cuối.',
    startPractice: 'Bắt đầu chơi thử',
    goHome: 'Tới trang chủ',
  },
};
