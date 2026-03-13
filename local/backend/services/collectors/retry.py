"""
Retry mechanism with exponential backoff

Formula: delay = min(base_delay * (2 ** attempt) + jitter, max_delay)

Reference: Similar to tenacity but simplified for our use case
"""
import asyncio
import random
import time
from dataclasses import dataclass
from typing import Callable, TypeVar, Optional, Tuple, Any
from functools import wraps

T = TypeVar('T')


@dataclass
class RetryPolicy:
    """
    Retry policy configuration

    Attributes:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries in seconds
        max_delay: Maximum delay between retries in seconds
        exponential_base: Exponential multiplier (default: 2)
        jitter: Whether to add random jitter to avoid thundering herd
        retryable_exceptions: Tuple of exception types to retry on
    """
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    retryable_exceptions: Tuple[type, ...] = (Exception,)

    def calculate_delay(self, attempt: int) -> float:
        """
        Calculate delay for the given attempt number

        Args:
            attempt: Current retry attempt (0-indexed)

        Returns:
            Delay in seconds
        """
        delay = self.base_delay * (self.exponential_base ** attempt)
        if self.jitter:
            delay += random.uniform(0, 1)
        return min(delay, self.max_delay)


class RetryExhaustedError(Exception):
    """Raised when all retry attempts are exhausted"""

    def __init__(self, message: str, last_exception: Optional[Exception] = None, attempts: int = 0):
        super().__init__(message)
        self.last_exception = last_exception
        self.attempts = attempts


async def with_retry(
    func: Callable[..., Any],
    *args,
    policy: Optional[RetryPolicy] = None,
    **kwargs
) -> Any:
    """
    Execute a function with retry logic

    Args:
        func: Async function to execute
        *args: Positional arguments for func
        policy: Retry policy (uses default if None)
        **kwargs: Keyword arguments for func

    Returns:
        Result of func execution

    Raises:
        RetryExhaustedError: If all retries are exhausted

    Example:
        result = await with_retry(
            fetch_data,
            symbol="000001.SZ",
            policy=RetryPolicy(max_retries=3, base_delay=2.0)
        )
    """
    if policy is None:
        policy = RetryPolicy()

    last_exception = None

    for attempt in range(policy.max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except policy.retryable_exceptions as e:
            last_exception = e

            if attempt < policy.max_retries:
                delay = policy.calculate_delay(attempt)
                print(f"[Retry] Attempt {attempt + 1}/{policy.max_retries + 1} failed: {e}. "
                      f"Retrying in {delay:.2f}s...")
                await asyncio.sleep(delay)
            else:
                print(f"[Retry] All {policy.max_retries + 1} attempts exhausted")

    raise RetryExhaustedError(
        f"Function failed after {policy.max_retries + 1} attempts",
        last_exception=last_exception,
        attempts=policy.max_retries + 1
    )


def retryable(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable_exceptions: Tuple[type, ...] = (Exception,)
):
    """
    Decorator to add retry logic to an async function

    Args:
        max_retries: Maximum retry attempts
        base_delay: Initial delay between retries
        max_delay: Maximum delay between retries
        retryable_exceptions: Exception types to retry on

    Example:
        @retryable(max_retries=3, base_delay=2.0)
        async def fetch_data(symbol: str) -> dict:
            # Implementation that may fail
            pass
    """
    policy = RetryPolicy(
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        retryable_exceptions=retryable_exceptions
    )

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            return await with_retry(func, *args, policy=policy, **kwargs)
        return wrapper
    return decorator


class CircuitState:
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class CircuitBreaker:
    """
    Circuit breaker for fault tolerance

    Prevents cascading failures by temporarily blocking requests
to a failing service.

    Attributes:
        failure_threshold: Number of failures before opening circuit
        recovery_timeout: Seconds to wait before attempting recovery
        half_open_max_calls: Max calls allowed in half-open state
    """
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    half_open_max_calls: int = 3

    def __post_init__(self):
        self.failures: int = 0
        self.last_failure_time: Optional[float] = None
        self.state: str = CircuitState.CLOSED
        self.half_open_calls: int = 0

    def can_execute(self) -> bool:
        """Check if request can be executed"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if self.last_failure_time and \
               (time.time() - self.last_failure_time) > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < self.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False

        return True

    def record_success(self):
        """Record successful execution"""
        self.failures = 0
        self.half_open_calls = 0
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED

    def record_failure(self):
        """Record failed execution"""
        self.failures += 1
        self.last_failure_time = time.time()

        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
        elif self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN

    def __repr__(self) -> str:
        return f"CircuitBreaker(state={self.state}, failures={self.failures})"
