from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class TaxonomyCategory(Base):
    __tablename__ = "taxonomy_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0", default=0)
    is_active = Column(Boolean, nullable=False, server_default="true", default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    topics = relationship(
        "TaxonomyTopic",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="TaxonomyTopic.sort_order",
        passive_deletes=True,
    )

    __table_args__ = (
        # Uniqueness enforced only among visible rows so a hidden category
        # never squats its name (see migration c3d4e5f6a7b8).
        Index(
            "uq_taxonomy_categories_name_active",
            "name",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        Index("ix_taxonomy_categories_name", "name"),
        Index("ix_taxonomy_categories_sort_order", "sort_order"),
    )


class TaxonomyTopic(Base):
    __tablename__ = "taxonomy_topics"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(
        Integer, ForeignKey("taxonomy_categories.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0", default=0)
    is_active = Column(Boolean, nullable=False, server_default="true", default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("TaxonomyCategory", back_populates="topics")

    __table_args__ = (
        # Same partial-uniqueness rule as categories (see migration c3d4e5f6a7b8).
        Index(
            "uq_taxonomy_topics_category_name_active",
            "category_id",
            "name",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        Index("ix_taxonomy_topics_category_id", "category_id"),
        Index("ix_taxonomy_topics_sort_order", "sort_order"),
    )
