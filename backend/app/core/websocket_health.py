"""WebSocket health monitoring and metrics tracking."""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional

from app.core.pubsub_manager import pubsub_manager

logger = logging.getLogger(__name__)


@dataclass
class WebSocketMetrics:
    """WebSocket connection metrics."""
    total_connections: int = 0
    active_connections: int = 0
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    avg_latency_ms: float = 0.0
    peak_connections: int = 0
    peak_latency_ms: float = 0.0
    total_messages: int = 0
    start_time: float = field(default_factory=time.time)


class WebSocketHealthMonitor:
    """
    Monitor WebSocket health and collect metrics.
    
    Tracks:
    - Connection counts (active, total, peak)
    - Message throughput (sent, received)
    - Error rates
    - Latency statistics
    - Redis Pub/Sub status
    """

    def __init__(self):
        self.metrics = WebSocketMetrics()
        self._latencies: list[float] = []
        self._max_latency_samples = 1000
        self._connection_history: list[dict] = []
        self._max_history_size = 100

    def record_connection(self, admin_id: str):
        """Record a new connection."""
        self.metrics.total_connections += 1
        self.metrics.active_connections += 1
        
        if self.metrics.active_connections > self.metrics.peak_connections:
            self.metrics.peak_connections = self.metrics.active_connections
        
        # Add to history
        self._connection_history.append({
            "admin_id": admin_id,
            "event": "connect",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self._trim_history()

    def record_disconnection(self, admin_id: str):
        """Record a disconnection."""
        self.metrics.active_connections = max(0, self.metrics.active_connections - 1)
        
        # Add to history
        self._connection_history.append({
            "admin_id": admin_id,
            "event": "disconnect",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self._trim_history()

    def record_message_sent(self, latency_ms: Optional[float] = None):
        """Record a sent message with optional latency."""
        self.metrics.messages_sent += 1
        self.metrics.total_messages += 1
        
        if latency_ms is not None:
            self._record_latency(latency_ms)

    def record_message_received(self):
        """Record a received message."""
        self.metrics.messages_received += 1
        self.metrics.total_messages += 1

    def record_error(self, error_type: str = "unknown"):
        """Record an error."""
        self.metrics.errors += 1
        logger.warning(f"WebSocket error recorded: {error_type}")

    def _record_latency(self, latency_ms: float):
        """Record a latency measurement."""
        self._latencies.append(latency_ms)
        
        if len(self._latencies) > self._max_latency_samples:
            self._latencies.pop(0)
        
        # Update average
        self.metrics.avg_latency_ms = sum(self._latencies) / len(self._latencies)
        
        # Update peak
        if latency_ms > self.metrics.peak_latency_ms:
            self.metrics.peak_latency_ms = latency_ms

    def _trim_history(self):
        """Trim connection history to max size."""
        if len(self._connection_history) > self._max_history_size:
            self._connection_history = self._connection_history[-self._max_history_size:]

    async def get_health_status(self) -> Dict:
        """
        Get current health status and metrics.
        
        Returns:
            Dict with status, metrics, and health indicators
        """
        uptime_seconds = time.time() - self.metrics.start_time
        
        # Calculate error rate
        error_rate = (
            self.metrics.errors / self.metrics.total_messages
            if self.metrics.total_messages > 0 else 0
        )
        
        # Determine health status
        status = "healthy"
        issues = []
        
        if error_rate > 0.1:  # More than 10% error rate
            status = "unhealthy"
            issues.append(f"High error rate: {error_rate:.2%}")
        elif error_rate > 0.05:  # More than 5% error rate
            status = "degraded"
            issues.append(f"Elevated error rate: {error_rate:.2%}")
        
        if self.metrics.avg_latency_ms > 1000:  # More than 1 second
            status = "degraded"
            issues.append(f"High latency: {self.metrics.avg_latency_ms:.0f}ms")
        
        # Check Redis Pub/Sub connection
        redis_connected = await self._check_redis()
        if not redis_connected:
            issues.append("Redis Pub/Sub disconnected")
        
        return {
            "status": status,
            "issues": issues,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "uptime_seconds": round(uptime_seconds, 0),
            "metrics": {
                "active_connections": self.metrics.active_connections,
                "peak_connections": self.metrics.peak_connections,
                "total_connections": self.metrics.total_connections,
                "messages_sent": self.metrics.messages_sent,
                "messages_received": self.metrics.messages_received,
                "total_messages": self.metrics.total_messages,
                "errors": self.metrics.errors,
                "error_rate": round(error_rate, 4),
                "avg_latency_ms": round(self.metrics.avg_latency_ms, 2),
                "peak_latency_ms": round(self.metrics.peak_latency_ms, 2)
            },
            "redis_connected": redis_connected,
            "recent_events": self._connection_history[-10:]  # Last 10 events
        }

    async def _check_redis(self) -> bool:
        """Check Redis Pub/Sub connection status."""
        try:
            if pubsub_manager.redis:
                await pubsub_manager.redis.ping()
                return True
        except Exception:
            pass
        return False

    def reset_metrics(self):
        """Reset all metrics (for testing)."""
        self.metrics = WebSocketMetrics()
        self._latencies = []
        self._connection_history = []


# Global health monitor instance
ws_health_monitor = WebSocketHealthMonitor()

