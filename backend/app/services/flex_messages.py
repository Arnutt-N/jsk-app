from linebot.v3.messaging import FlexContainer

_BOOKING_STATUS_MAP = {
    "CONFIRMED": {"text": "ยืนยันแล้ว", "color": "#10B981"},   # Emerald
    "CANCELLED": {"text": "ยกเลิก", "color": "#EF4444"},        # Rose
    "COMPLETED": {"text": "มาตามนัดแล้ว", "color": "#3B82F6"},  # Blue
    "NOSHOW": {"text": "ไม่มาตามนัด", "color": "#F59E0B"},      # Amber
}


def _format_thai_date(value):
    """Render a date as d/m/พ.ศ. — Buddhist era is what the counter uses."""
    if not value:
        return "-"
    return f"{value.day}/{value.month}/{value.year + 543}"


def _format_time(value):
    return value.strftime("%H:%M") if value else "-"


def _booking_detail_row(label, value):
    return {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "contents": [
            {"type": "text", "text": label, "size": "sm", "color": "#aaaaaa", "flex": 2},
            {
                "type": "text",
                "text": value,
                "size": "sm",
                "color": "#333333",
                "flex": 4,
                "wrap": True,
                "align": "end",
            },
        ],
    }


def build_booking_confirmation(booking, *, title="✅ จองคิวสำเร็จ"):
    """Bubble sent right after a booking is confirmed, and again as a reminder."""
    return {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": title, "weight": "bold", "size": "xl", "color": "#1DB446"},
                {
                    "type": "text",
                    "text": booking.service_type or "-",
                    "size": "sm",
                    "color": "#aaaaaa",
                    "wrap": True,
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": booking.queue_number or "-",
                    "weight": "bold",
                    "size": "xxl",
                    "align": "center",
                    "color": "#1DB446",
                },
                {
                    "type": "text",
                    "text": "หมายเลขคิวของท่าน",
                    "size": "xs",
                    "align": "center",
                    "color": "#aaaaaa",
                },
                {"type": "separator", "margin": "lg", "color": "#f0f0f0"},
                _booking_detail_row("วันที่", _format_thai_date(booking.booking_date)),
                _booking_detail_row("เวลา", f"{_format_time(booking.booking_time)} น."),
                _booking_detail_row("ชื่อผู้จอง", booking.contact_name or "-"),
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "กรุณามาก่อนเวลานัด 10 นาที",
                    "size": "xs",
                    "align": "center",
                    "color": "#aaaaaa",
                    "wrap": True,
                }
            ],
        },
    }


def build_booking_list(bookings):
    """Bubble listing a citizen's upcoming bookings, for the 'คิว' query."""
    if not bookings:
        return {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "ไม่พบคิวนัดหมายของคุณ",
                        "weight": "bold",
                        "size": "md",
                        "align": "center",
                        "color": "#666666",
                    },
                    {
                        "type": "text",
                        "text": "ท่านสามารถจองคิวนัดหมายได้จากเมนูด้านล่างครับ",
                        "size": "xs",
                        "align": "center",
                        "color": "#aaaaaa",
                        "wrap": True,
                        "margin": "md",
                    },
                ],
            },
        }

    rows = []
    for booking in bookings:
        status = _BOOKING_STATUS_MAP.get(
            getattr(booking.status, "value", str(booking.status)),
            {"text": str(booking.status), "color": "#999999"},
        )
        rows.append(
            {
                "type": "box",
                "layout": "vertical",
                "margin": "lg",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "text",
                        "text": f"{booking.queue_number or '-'} · {booking.service_type or '-'}",
                        "size": "sm",
                        "color": "#333333",
                        "weight": "bold",
                        "wrap": True,
                    },
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {
                                "type": "text",
                                "text": status["text"],
                                "size": "xs",
                                "color": status["color"],
                                "flex": 0,
                            },
                            {"type": "filler"},
                            {
                                "type": "text",
                                "text": (
                                    f"{_format_thai_date(booking.booking_date)} "
                                    f"{_format_time(booking.booking_time)} น."
                                ),
                                "size": "xs",
                                "color": "#aaaaaa",
                                "align": "end",
                            },
                        ],
                    },
                    {"type": "separator", "margin": "lg", "color": "#f0f0f0"},
                ],
            }
        )

    rows[-1]["contents"].pop()  # trailing separator

    return {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": "📅 คิวนัดหมายของคุณ", "weight": "bold", "size": "xl", "color": "#1DB446"},
                {"type": "text", "text": f"{len(bookings)} รายการ", "size": "xs", "color": "#aaaaaa"},
            ],
        },
        "body": {"type": "box", "layout": "vertical", "contents": rows},
    }


def build_request_status_list(requests):
    """
    Build a Flex Message Bubble showing a list of service requests.
    
    Args:
        requests: List of ServiceRequest objects
    """
    
    if not requests:
        return {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "ไม่พบประวัติคำร้องของคุณ",
                        "weight": "bold",
                        "size": "md",
                        "align": "center",
                        "color": "#666666"
                    },
                    {
                        "type": "text",
                        "text": "คุณสามารถส่งข้อความหาเราเพื่อเริ่มเรื่องใหม่ได้เลยครับ",
                        "size": "xs",
                        "align": "center",
                        "color": "#aaaaaa",
                        "wrap": True,
                        "margin": "md"
                    }
                ]
            }
        }

    # Header
    header_box = {
        "type": "box",
        "layout": "vertical",
        "contents": [
            {
                "type": "text",
                "text": "📋 คำร้องของคุณ",
                "weight": "bold",
                "size": "xl",
                "color": "#1DB446"
            },
            {
                "type": "text",
                "text": f"{len(requests)} รายการล่าสุด",
                "size": "xs",
                "color": "#aaaaaa"
            }
        ]
    }

    # Body (List of items)
    body_contents = []
    
    for req in requests:
        # Determine status color and text
        status_map = {
            "PENDING": {"text": "รอดำเนินการ", "color": "#F59E0B"}, # Amber
            "IN_PROGRESS": {"text": "กำลังดำเนินงาน", "color": "#3B82F6"}, # Blue
            "AWAITING_APPROVAL": {"text": "รออนุมัติ", "color": "#6366F1"}, # Indigo
            "COMPLETED": {"text": "เสร็จสิ้น", "color": "#10B981"}, # Emerald
            "REJECTED": {"text": "ยกเลิก/ปฏิเสธ", "color": "#EF4444"} # Rose
        }
        
        status_info = status_map.get(str(req.status), {"text": str(req.status), "color": "#999999"})
        
        # Format Date (Simple Thai Date)
        # Assuming req.created_at is a datetime object
        created_date = req.created_at.strftime("%d/%m/%y") if req.created_at else "-"

        row = {
            "type": "box",
            "layout": "vertical",
            "margin": "lg",
            "spacing": "sm",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"#{req.id} - {req.topic_category or 'ไม่ระบุหมวดหมู่'}",
                            "size": "sm",
                            "color": "#333333",
                            "weight": "bold",
                            "flex": 4,
                            "wrap": True
                        }
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [],
                                    "width": "6px",
                                    "height": "6px",
                                    "backgroundColor": status_info["color"],
                                    "cornerRadius": "3px",
                                    "offsetTop": "6px"
                                },
                                {
                                    "type": "text",
                                    "text": status_info["text"],
                                    "size": "xs",
                                    "color": status_info["color"],
                                    "margin": "sm",
                                    "flex": 0
                                }
                            ],
                            "flex": 0
                        },
                        {
                            "type": "filler"
                        },
                        {
                            "type": "text",
                            "text": created_date,
                            "size": "xs",
                            "color": "#aaaaaa",
                            "align": "end"
                        }
                    ]
                },
                {
                    "type": "separator",
                    "margin": "lg",
                    "color": "#f0f0f0"
                }
            ]
        }
        body_contents.append(row)
        
    # Remove last separator
    if body_contents:
       body_contents[-1]["contents"].pop()

    return {
        "type": "bubble",
        "header": header_box,
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": body_contents
        }
    }
