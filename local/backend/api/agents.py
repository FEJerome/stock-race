"""
AI Agent Management API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from datetime import datetime
import uuid

from models.database import get_db, AgentModel, TradeModel, PositionModel
from models.schemas import (
    AgentCreate, AgentResponse, AgentListResponse,
    ApiResponse, AgentUpdate
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.post("", response_model=ApiResponse)
async def create_agent(
    agent_data: AgentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new AI agent

    - **name**: AI name (2-20 characters)
    - **initial_capital**: Initial capital (10,000 - 1 billion)
    - **strategy**: Strategy configuration (five dimensions)
    - **model_provider**: Model provider (default: kimi)
    - **model_name**: Model name (default: kimi-k2-5)
    - **agent_level**: Agent level: intern/manager/partner
    - **incentive_level**: Incentive level: standard/active/aggressive
    """
    # Generate unique ID
    agent_id = str(uuid.uuid4())

    # Create agent model
    db_agent = AgentModel(
        id=agent_id,
        name=agent_data.name,
        initial_capital=agent_data.initial_capital,
        current_capital=agent_data.initial_capital,
        strategy=agent_data.strategy.model_dump(),
        model_provider=agent_data.model_provider,
        model_name=agent_data.model_name,
        agent_level=agent_data.agent_level,
        incentive_level=agent_data.incentive_level,
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    db.add(db_agent)
    await db.commit()
    await db.refresh(db_agent)

    return ApiResponse(
        code=0,
        message="success",
        data=AgentResponse.model_validate(db_agent)
    )


@router.get("", response_model=ApiResponse)
async def list_agents(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """
    Get AI agent list with pagination

    - **page**: Page number (starts from 1)
    - **page_size**: Items per page (max 100)
    """
    # Validate pagination
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20

    # Get total count
    count_result = await db.execute(select(AgentModel))
    total = len(count_result.scalars().all())

    # Get paginated results
    offset = (page - 1) * page_size
    result = await db.execute(
        select(AgentModel)
        .order_by(AgentModel.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    agents = result.scalars().all()

    return ApiResponse(
        code=0,
        message="success",
        data={
            "items": [AgentResponse.model_validate(agent) for agent in agents],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    )


@router.get("/{agent_id}", response_model=ApiResponse)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a single AI agent by ID"""
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    return ApiResponse(
        code=0,
        message="success",
        data=AgentResponse.model_validate(agent)
    )


@router.patch("/{agent_id}", response_model=ApiResponse)
async def update_agent(
    agent_id: str,
    agent_update: AgentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update AI agent information

    - **name**: AI name (optional)
    - **status**: active/paused (optional)
    - **incentive_level**: standard/active/aggressive (optional)
    """
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    # Update fields
    if agent_update.name is not None:
        agent.name = agent_update.name
    if agent_update.status is not None:
        agent.status = agent_update.status
    if agent_update.incentive_level is not None:
        agent.incentive_level = agent_update.incentive_level

    agent.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(agent)

    return ApiResponse(
        code=0,
        message="success",
        data=AgentResponse.model_validate(agent)
    )


@router.delete("/{agent_id}", response_model=ApiResponse)
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete an AI agent and all related data"""
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    # Delete related data first
    await db.execute(delete(TradeModel).where(TradeModel.agent_id == agent_id))
    await db.execute(delete(PositionModel).where(PositionModel.agent_id == agent_id))

    # Delete agent
    await db.delete(agent)
    await db.commit()

    return ApiResponse(
        code=0,
        message="success",
        data={"deleted_id": agent_id}
    )


@router.post("/{agent_id}/pause", response_model=ApiResponse)
async def pause_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Pause AI agent trading"""
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    agent.status = "paused"
    agent.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(agent)

    return ApiResponse(
        code=0,
        message="success",
        data=AgentResponse.model_validate(agent)
    )


@router.post("/{agent_id}/resume", response_model=ApiResponse)
async def resume_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Resume AI agent trading"""
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    agent.status = "active"
    agent.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(agent)

    return ApiResponse(
        code=0,
        message="success",
        data=AgentResponse.model_validate(agent)
    )


@router.get("/{agent_id}/promotion", response_model=ApiResponse)
async def get_promotion_status(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get AI agent promotion status and progress

    Returns current rank, level, and promotion requirements.
    """
    from services.promotion_service import PromotionService

    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    service = PromotionService(db)
    progress = await service.get_promotion_progress(agent_id)
    title = await service.get_agent_title(agent_id)

    return ApiResponse(
        code=0,
        message="success",
        data={
            "agent_id": agent_id,
            "title": title,
            **progress
        }
    )


@router.post("/{agent_id}/promote", response_model=ApiResponse)
async def promote_agent_endpoint(
    agent_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Promote AI agent to next rank if eligible

    Requirements:
    - Intern -> Manager: Lv.6, 5% return, 10 trades
    - Manager -> Partner: Lv.12, 15% return, 30 trades
    """
    from services.promotion_service import promote_agent

    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    success, message = await promote_agent(db, agent_id)

    if success:
        return ApiResponse(code=0, message=message, data={"promoted": True})
    else:
        return ApiResponse(code=1, message=message, data={"promoted": False})
