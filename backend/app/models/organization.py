from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    
    # Hierarchy
    ministry = Column(String, nullable=True)
    department = Column(String, nullable=True)
    division = Column(String, nullable=True)
    
    # Check Architecture Design for full list (Sector Type, Province, etc.)
    sector_type = Column(String, nullable=True) # central, provincial, etc.
    province = Column(String, nullable=True)
    district = Column(String, nullable=True)
    subdistrict = Column(String, nullable=True)
    
    users = relationship("User", back_populates="organization")
