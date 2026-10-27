"""Report query service — mixin facade for all admin report queries.

Extracted from admin_reports.py where ~600 lines of SQLAlchemy queries
were inline in endpoint handlers. Endpoints now delegate here.
"""
from .followers import FollowerReportMixin
from .helpers import bucket_expression, format_bucket, parse_dates, time_range_for_day
from .messages import MessageReportMixin
from .operators import OperatorReportMixin
from .overview import OverviewMixin
from .service_requests import ServiceRequestReportMixin


class ReportService(
    OverviewMixin,
    ServiceRequestReportMixin,
    MessageReportMixin,
    OperatorReportMixin,
    FollowerReportMixin,
):
    pass


report_service = ReportService()

__all__ = [
    "report_service",
    "ReportService",
    "parse_dates",
    "time_range_for_day",
    "bucket_expression",
    "format_bucket",
]
