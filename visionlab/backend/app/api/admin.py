from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.models import AnalysisTask, User
from app.schemas.schemas import AdminAnalyticsResponse, UserOut

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/analytics", response_model=AdminAnalyticsResponse)
async def get_analytics(
    admin: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    total_users: int = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    task_agg = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((AnalysisTask.status == "completed", 1))).label("completed"),
            func.count(case((AnalysisTask.status == "failed", 1))).label("failed"),
            func.avg(case((AnalysisTask.status == "completed", AnalysisTask.processing_ms))).label("avg_ms"),
        ).select_from(AnalysisTask)
    )
    agg = task_agg.one()
    total_tasks: int = agg.total
    completed_tasks: int = agg.completed
    failed_tasks: int = agg.failed
    avg_processing_ms = agg.avg_ms

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    tasks_last_24h: int = (
        await db.execute(
            select(func.count()).select_from(AnalysisTask).where(AnalysisTask.created_at >= cutoff)
        )
    ).scalar_one()

    completed_tasks_result = await db.execute(
        select(AnalysisTask.detection_results).where(
            AnalysisTask.status == "completed",
            AnalysisTask.detection_results.isnot(None),
        ).limit(500)
    )
    label_counter: Counter = Counter()
    for (detections,) in completed_tasks_result:
        if detections:
            for d in detections:
                label_counter[d.get("label", "unknown")] += 1

    top_objects: List[Dict[str, Any]] = [
        {"label": label, "count": count}
        for label, count in label_counter.most_common(10)
    ]

    return AdminAnalyticsResponse(
        total_users=total_users,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        failed_tasks=failed_tasks,
        avg_processing_ms=float(avg_processing_ms) if avg_processing_ms else None,
        tasks_last_24h=tasks_last_24h,
        top_detected_objects=top_objects,
    )


@router.get("/users", response_model=List[UserOut])
async def list_users(
    admin: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
):
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    return result.scalars().all()
