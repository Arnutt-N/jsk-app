from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trends: dict
    session_volume: list[dict]
    peak_hours: list[dict]
    funnel: dict
    percentiles: dict
    generated_at: datetime
    cache_hit: bool = False
