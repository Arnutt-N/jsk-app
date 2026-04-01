export type Locale = 'th' | 'en';

export const translations: Record<Locale, Record<string, string>> = {
  th: {
    // ─── Navbar ───
    nav_features: 'ฟีเจอร์',
    nav_stats: 'สถิติ',
    nav_integration: 'การเชื่อมต่อ',
    nav_login: 'เข้าสู่ระบบ',
    nav_dashboard: 'แดชบอร์ด',

    // ─── Hero ───
    hero_badge: 'แพลตฟอร์มยุติธรรมชุมชน 4.0',
    hero_title_line1: 'ยกระดับการจัดการ',
    hero_title_line2: 'LINE Official Account',
    hero_subtitle:
      'รวมทุกเครื่องมือที่คุณต้องการ Live Chat, Chatbot, Service Request และ Analytics ไว้ในที่เดียว เพื่อการบริการประชาชนที่รวดเร็วและไร้รอยต่อ',
    hero_cta_start: 'เริ่มต้นใช้งานฟรี',
    hero_cta_demo: 'ดูตัวอย่างระบบ',

    // Hero mockup labels
    hero_mock_requests: 'Total Requests',
    hero_mock_requests_val: '4,521',
    hero_mock_requests_trend: '+12.5%',
    hero_mock_chats: 'Active Chats',
    hero_mock_chats_val: '23',
    hero_mock_chats_trend: '3 urgent',
    hero_mock_response: 'Avg Response',
    hero_mock_response_val: '1.2m',
    hero_mock_response_trend: '-8.1%',
    hero_mock_csat: 'CSAT Score',
    hero_mock_csat_val: '4.8',
    hero_mock_csat_trend: '127 reviews',

    // ─── Stats ───
    stat_24_7: 'ให้บริการตลอดเวลา',
    stat_uptime: 'Uptime SLA',
    stat_response: 'ตอบกลับเร็วขึ้น',
    stat_users: 'ผู้ใช้งานระบบ',

    // ─── Features ───
    features_badge: 'ฟีเจอร์ทรงพลัง',
    features_title_prefix: 'ครบจบใน',
    features_title_accent: 'แพลตฟอร์มเดียว',
    features_subtitle:
      'ออกแบบมาเพื่อตอบโจทย์การทำงานของหน่วยงานยุติธรรมโดยเฉพาะ',

    feature_chatbot_title: 'Chatbot อัจฉริยะ',
    feature_chatbot_desc:
      'ตอบกลับอัตโนมัติด้วย Intent matching ที่แม่นยำ รองรับการส่ง Flex Message และ Rich Menu แบบไดนามิก',
    feature_chatbot_tag1: 'NLP Processing',
    feature_chatbot_tag2: 'Flex Message',
    feature_chatbot_tag3: 'Rich Menu',

    feature_livechat_title: 'Live Chat ทันที',
    feature_livechat_desc:
      'เชื่อมต่อเจ้าหน้าที่กับประชาชนแบบ Real-time พร้อมระบบ Queue และ Transfer',

    feature_analytics_title: 'Analytics ครบครัน',
    feature_analytics_desc:
      'ติดตาม KPI, FCR, SLA แบบเรียลไทม์ พร้อมรายงานประสิทธิภาพเชิงลึก',

    feature_request_title: 'Service Request',
    feature_request_desc:
      'รับเรื่อง ติดตาม และปิดงานอย่างเป็นระบบด้วย Kanban board พร้อมระบบมอบหมายงานอัตโนมัติ',
    feature_kanban_new: 'ร้องเรียนใหม่',
    feature_kanban_progress: 'กำลังดำเนินการ',
    feature_kanban_review: 'รอตรวจสอบ',

    // ─── LINE Integration ───
    line_badge: 'Seamless Integration',
    line_title_prefix: 'เชื่อมต่อบริการผ่าน',
    line_title_accent: 'LINE Official Account',
    line_subtitle:
      'ให้ประชาชนเข้าถึงบริการ ยื่นคำร้อง และติดตามสถานะได้ง่ายๆ ผ่านแอปพลิเคชันที่คุ้นเคยตลอด 24 ชั่วโมง',
    line_cta_request: 'แบบคำขอรับบริการ',
    line_cta_friend: 'เพิ่มเพื่อน LINE',

    line_chat_title: 'แชทกับเจ้าหน้าที่',
    line_chat_desc: 'สอบถามข้อมูลแบบ Real-time',
    line_request_title: 'ส่งคำร้องบริการ',
    line_request_desc: 'ยื่นแบบฟอร์มออนไลน์สะดวก รวดเร็ว',
    line_track_title: 'ติดตามสถานะ',
    line_track_desc: 'ตรวจสอบความคืบหน้าได้ทันที',

    // ─── Footer ───
    footer_brand_desc:
      'แพลตฟอร์มบริหารจัดการ LINE Official Account แบบครบวงจร ยกระดับการให้บริการประชาชนสู่ยุคดิจิทัล',
    footer_about: 'เกี่ยวกับ',
    footer_about_system: 'ระบบ JSK Platform',
    footer_about_office: 'สำนักงานยุติธรรมจังหวัด',
    footer_about_policy: 'นโยบายความเป็นส่วนตัว',
    footer_services: 'บริการ',
    footer_services_livechat: 'Live Chat',
    footer_services_request: 'คำร้องบริการ',
    footer_services_chatbot: 'Chatbot',
    footer_services_reports: 'รายงานสถิติ',
    footer_contact: 'ติดต่อ',
    footer_address:
      '120 หมู่ 3 ชั้น 3 ศูนย์ราชการเฉลิมพระเกียรติฯ ถนนแจ้งวัฒนะ กรุงเทพฯ 10210',
    footer_copyright: 'สำนักงานยุติธรรมจังหวัด กระทรวงยุติธรรม. All rights reserved.',
  },

  en: {
    // ─── Navbar ───
    nav_features: 'Features',
    nav_stats: 'Stats',
    nav_integration: 'Integration',
    nav_login: 'Login',
    nav_dashboard: 'Dashboard',

    // ─── Hero ───
    hero_badge: 'Community Justice Platform 4.0',
    hero_title_line1: 'Elevate Management of',
    hero_title_line2: 'LINE Official Account',
    hero_subtitle:
      'All the tools you need — Live Chat, Chatbot, Service Request, and Analytics — in one place for fast and seamless public services.',
    hero_cta_start: 'Get Started Free',
    hero_cta_demo: 'View Demo',

    hero_mock_requests: 'Total Requests',
    hero_mock_requests_val: '4,521',
    hero_mock_requests_trend: '+12.5%',
    hero_mock_chats: 'Active Chats',
    hero_mock_chats_val: '23',
    hero_mock_chats_trend: '3 urgent',
    hero_mock_response: 'Avg Response',
    hero_mock_response_val: '1.2m',
    hero_mock_response_trend: '-8.1%',
    hero_mock_csat: 'CSAT Score',
    hero_mock_csat_val: '4.8',
    hero_mock_csat_trend: '127 reviews',

    // ─── Stats ───
    stat_24_7: 'Available 24/7',
    stat_uptime: 'Uptime SLA',
    stat_response: 'Faster Response',
    stat_users: 'System Users',

    // ─── Features ───
    features_badge: 'Powerful Features',
    features_title_prefix: 'Everything in',
    features_title_accent: 'One Platform',
    features_subtitle:
      'Designed specifically for the operational needs of justice agencies.',

    feature_chatbot_title: 'Smart Chatbot',
    feature_chatbot_desc:
      'Automated replies with accurate intent matching, supporting Flex Messages and dynamic Rich Menus.',
    feature_chatbot_tag1: 'NLP Processing',
    feature_chatbot_tag2: 'Flex Message',
    feature_chatbot_tag3: 'Rich Menu',

    feature_livechat_title: 'Instant Live Chat',
    feature_livechat_desc:
      'Connect operators with citizens in real-time with queue and transfer support.',

    feature_analytics_title: 'Full Analytics',
    feature_analytics_desc:
      'Track KPIs, FCR, and SLA in real-time with deep performance reports.',

    feature_request_title: 'Service Request',
    feature_request_desc:
      'Receive, track, and close requests systematically with Kanban boards and auto-assignment.',
    feature_kanban_new: 'New Complaint',
    feature_kanban_progress: 'In Progress',
    feature_kanban_review: 'Under Review',

    // ─── LINE Integration ───
    line_badge: 'Seamless Integration',
    line_title_prefix: 'Connect services via',
    line_title_accent: 'LINE Official Account',
    line_subtitle:
      'Let citizens access services, submit requests, and track status easily through the app they already use — 24/7.',
    line_cta_request: 'Service Request Form',
    line_cta_friend: 'Add LINE Friend',

    line_chat_title: 'Chat with Staff',
    line_chat_desc: 'Ask questions in real-time.',
    line_request_title: 'Submit a Request',
    line_request_desc: 'Fill out the online form quickly and easily.',
    line_track_title: 'Track Status',
    line_track_desc: 'Check progress anytime.',

    // ─── Footer ───
    footer_brand_desc:
      'An all-in-one LINE Official Account management platform, elevating public services into the digital era.',
    footer_about: 'About',
    footer_about_system: 'JSK Platform',
    footer_about_office: 'Provincial Justice Office',
    footer_about_policy: 'Privacy Policy',
    footer_services: 'Services',
    footer_services_livechat: 'Live Chat',
    footer_services_request: 'Service Request',
    footer_services_chatbot: 'Chatbot',
    footer_services_reports: 'Statistics',
    footer_contact: 'Contact',
    footer_address:
      '120 Moo 3, 3rd Floor, Government Complex, Chaeng Watthana Road, Bangkok 10210',
    footer_copyright: 'Provincial Justice Office, Ministry of Justice. All rights reserved.',
  },
};

export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? key;
}
