from sqlalchemy import Column, DateTime, String, Text

from app.core.timezone import get_utc_now
from app.db.base import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
