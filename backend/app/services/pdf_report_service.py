"""PDF report generation service using reportlab."""

from datetime import datetime, timezone
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


class PDFReportService:
    """Generates PDF reports with styled tables for each report type."""

    def __init__(self) -> None:
        self.styles = getSampleStyleSheet()
        self.styles.add(ParagraphStyle(
            'ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=18,
            spaceAfter=12,
        ))
        self.styles.add(ParagraphStyle(
            'ReportSubtitle',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.grey,
            spaceAfter=20,
        ))

    def generate(self, report_type: str, data: dict, period: int) -> BytesIO:
        """Generate PDF for a given report type.

        Args:
            report_type: One of overview, service-requests, messages, operators, followers.
            data: Report data dict matching the structure of the corresponding JSON endpoint.
            period: Number of days the report covers.

        Returns:
            BytesIO buffer containing the PDF document.
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )
        elements: list = []

        title_map = {
            'overview': 'Overview Report',
            'service-requests': 'Service Requests Report',
            'messages': 'Messages Report',
            'operators': 'Operators Report',
            'followers': 'Followers Report',
        }
        title = title_map.get(report_type, 'Report')
        elements.append(Paragraph(title, self.styles['ReportTitle']))
        elements.append(Paragraph(
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | Period: {period} days",
            self.styles['ReportSubtitle'],
        ))

        builder = getattr(self, f'_build_{report_type.replace("-", "_")}', None)
        if builder:
            builder(elements, data)
        else:
            elements.append(Paragraph(
                'No data available for this report type.',
                self.styles['Normal'],
            ))

        doc.build(elements)
        buffer.seek(0)
        return buffer

    # ------------------------------------------------------------------
    # Shared table builder
    # ------------------------------------------------------------------

    def _build_table(
        self,
        elements: list,
        headers: list[str],
        rows: list[list],
        col_widths: list | None = None,
    ) -> None:
        """Append a styled table to *elements*."""
        table_data = [headers] + rows
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C3AED')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F3FF')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 12))

    # ------------------------------------------------------------------
    # Per-report builders
    # ------------------------------------------------------------------

    def _build_overview(self, elements: list, data: dict) -> None:
        """Build overview report tables."""
        elements.append(Paragraph('Summary', self.styles['Heading2']))

        def _trend_str(trend: dict | None) -> str:
            if not trend:
                return '-'
            pct = trend.get('change_percent', 0)
            sign = '+' if pct > 0 else ''
            return f"{sign}{pct}%"

        headers = ['Metric', 'Value', 'Trend']
        rows = [
            [
                'Total Requests',
                str(data.get('total_requests', 0)),
                _trend_str(data.get('requests_trend')),
            ],
            [
                'Messages Today',
                str(data.get('total_messages_today', 0)),
                _trend_str(data.get('messages_trend')),
            ],
            [
                'Total Followers',
                str(data.get('total_followers', 0)),
                _trend_str(data.get('followers_trend')),
            ],
            [
                'Active Sessions',
                str(data.get('active_sessions', 0)),
                _trend_str(data.get('sessions_trend')),
            ],
        ]
        self._build_table(elements, headers, rows)

        # Requests by status
        by_status = data.get('requests_by_status', {})
        if by_status:
            elements.append(Paragraph('Requests by Status', self.styles['Heading2']))
            self._build_table(
                elements,
                ['Status', 'Count'],
                [[str(k), str(v)] for k, v in by_status.items()],
            )

    def _build_service_requests(self, elements: list, data: dict) -> None:
        """Build service requests report."""
        elements.append(Paragraph('By Status', self.styles['Heading2']))
        by_status = data.get('by_status', {})
        self._build_table(
            elements,
            ['Status', 'Count'],
            [[str(k), str(v)] for k, v in by_status.items()],
        )

        by_cat = data.get('by_category', [])
        if by_cat:
            elements.append(Paragraph('By Category', self.styles['Heading2']))
            rows = [
                [str(item.get('category', '')), str(item.get('count', 0))]
                for item in by_cat
            ]
            self._build_table(elements, ['Category', 'Count'], rows)

        avg_res = data.get('avg_resolution_days', 0)
        elements.append(Paragraph(
            f'Average Resolution: {avg_res:.2f} days',
            self.styles['Normal'],
        ))

    def _build_messages(self, elements: list, data: dict) -> None:
        """Build messages report."""
        elements.append(Paragraph('Message Summary', self.styles['Heading2']))
        headers = ['Metric', 'Value']
        rows = [
            ['Total Incoming', str(data.get('incoming_total', 0))],
            ['Total Outgoing', str(data.get('outgoing_total', 0))],
        ]
        self._build_table(elements, headers, rows)

        peak_hours = data.get('peak_hours', [])
        if peak_hours:
            elements.append(Paragraph('Peak Hours', self.styles['Heading2']))
            rows = [
                [f"{int(h.get('hour', 0)):02d}:00", str(h.get('count', 0))]
                for h in peak_hours
            ]
            self._build_table(elements, ['Hour', 'Messages'], rows)

    def _build_operators(self, elements: list, data: dict) -> None:
        """Build operators performance report."""
        elements.append(Paragraph('Operator Performance', self.styles['Heading2']))
        operators = data.get('operators', [])
        if operators:
            headers = ['Operator', 'Sessions', 'Avg Response (s)', 'Messages Sent']
            rows = [
                [
                    str(op.get('operator_name', 'Unknown')),
                    str(op.get('sessions_handled', 0)),
                    str(round(op.get('avg_response_seconds', 0), 1)),
                    str(op.get('messages_sent', 0)),
                ]
                for op in operators
            ]
            self._build_table(elements, headers, rows)
        else:
            elements.append(Paragraph(
                'No operator data for this period.',
                self.styles['Normal'],
            ))

    def _build_followers(self, elements: list, data: dict) -> None:
        """Build followers report."""
        elements.append(Paragraph('Follower Summary', self.styles['Heading2']))
        headers = ['Metric', 'Value']
        rows = [
            ['Total Followers', str(data.get('total_followers', 0))],
            ['New (period)', str(data.get('new_this_period', 0))],
            ['Lost (period)', str(data.get('lost_this_period', 0))],
            ['Refollow (period)', str(data.get('refollow_this_period', 0))],
            ['Net Growth', str(data.get('net_growth', 0))],
            ['Refollow Rate', f"{data.get('refollow_rate', 0):.1f}%"],
        ]
        self._build_table(elements, headers, rows)
