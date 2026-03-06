"""Unit tests for Token debouncer."""
import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
import time

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from ai_service.services.token_debouncer import TokenDebouncer, DebounceKey
from ai_service.models.schemas import AIProvider


class TestDebounceKey:
    """Test suite for DebounceKey."""

    def test_init(self):
        """Test debounce key initialization."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        assert key.account_id == "acc_123"
        assert key.symbol == "000001.SZ"
        assert key.provider == AIProvider.OPENAI

    def test_equality(self):
        """Test debounce key equality."""
        key1 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key2 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key3 = DebounceKey("acc_456", "000001.SZ", AIProvider.OPENAI)

        assert key1 == key2
        assert key1 != key3
        assert hash(key1) == hash(key2)

    def test_hash(self):
        """Test debounce key hashing."""
        key1 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key2 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        # Should be usable as dict key
        d = {key1: "value"}
        assert d[key2] == "value"


class TestTokenDebouncer:
    """Test suite for TokenDebouncer."""

    def setup_method(self):
        """Reset debouncer before each test."""
        TokenDebouncer._instance = None
        TokenDebouncer._initialized = False
        self.debouncer = TokenDebouncer()

    def test_singleton(self):
        """Test that TokenDebouncer is a singleton."""
        debouncer1 = TokenDebouncer()
        debouncer2 = TokenDebouncer()
        assert debouncer1 is debouncer2

    def test_init(self):
        """Test debouncer initialization."""
        assert self.debouncer is not None
        assert self.debouncer._min_interval_seconds == 300  # 5 minutes
        assert self.debouncer._last_request_times == {}

    def test_can_make_request_first_time(self):
        """Test that first request is always allowed."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        can_request, wait_time = self.debouncer.can_make_request(key)

        assert can_request is True
        assert wait_time == 0

    def test_can_make_request_within_interval(self):
        """Test request within debounce interval is blocked."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        # First request
        self.debouncer.record_request(key)

        # Second request immediately
        can_request, wait_time = self.debouncer.can_make_request(key)

        assert can_request is False
        assert wait_time > 0
        assert wait_time <= 300  # Should be less than or equal to 5 minutes

    def test_can_make_request_after_interval(self):
        """Test request after debounce interval is allowed."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        # First request
        self.debouncer.record_request(key)

        # Simulate time passing (6 minutes)
        self.debouncer._last_request_times[key] = datetime.now() - timedelta(seconds=360)

        can_request, wait_time = self.debouncer.can_make_request(key)

        assert can_request is True
        assert wait_time == 0

    def test_record_request(self):
        """Test recording a request."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        self.debouncer.record_request(key)

        assert key in self.debouncer._last_request_times
        assert isinstance(self.debouncer._last_request_times[key], datetime)

    def test_get_remaining_seconds(self):
        """Test getting remaining seconds."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        # No record yet
        remaining = self.debouncer.get_remaining_seconds(key)
        assert remaining == 0

        # Record request
        self.debouncer.record_request(key)

        # Should have remaining time
        remaining = self.debouncer.get_remaining_seconds(key)
        assert remaining > 0
        assert remaining <= 300

    def test_clear_record(self):
        """Test clearing a record."""
        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)

        self.debouncer.record_request(key)
        assert key in self.debouncer._last_request_times

        self.debouncer.clear_record(key)
        assert key not in self.debouncer._last_request_times

    def test_clear_all_records(self):
        """Test clearing all records."""
        key1 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key2 = DebounceKey("acc_456", "000002.SZ", AIProvider.DEEPSEEK)

        self.debouncer.record_request(key1)
        self.debouncer.record_request(key2)

        assert len(self.debouncer._last_request_times) == 2

        self.debouncer.clear_all_records()
        assert len(self.debouncer._last_request_times) == 0

    def test_get_stats(self):
        """Test getting debouncer statistics."""
        key1 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key2 = DebounceKey("acc_456", "000002.SZ", AIProvider.DEEPSEEK)

        self.debouncer.record_request(key1)
        self.debouncer.record_request(key2)

        stats = self.debouncer.get_stats()

        assert stats["total_records"] == 2
        assert stats["min_interval_seconds"] == 300

    def test_different_keys_independent(self):
        """Test that different keys are tracked independently."""
        key1 = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        key2 = DebounceKey("acc_123", "000002.SZ", AIProvider.OPENAI)
        key3 = DebounceKey("acc_456", "000001.SZ", AIProvider.OPENAI)

        # Record for key1
        self.debouncer.record_request(key1)

        # key2 and key3 should still be allowed
        assert self.debouncer.can_make_request(key2)[0] is True
        assert self.debouncer.can_make_request(key3)[0] is True

    def test_custom_interval(self):
        """Test debouncer with custom interval."""
        # Reset singleton to test custom interval
        TokenDebouncer._instance = None
        TokenDebouncer._initialized = False

        debouncer = TokenDebouncer(min_interval_seconds=60)  # 1 minute
        assert debouncer._min_interval_seconds == 60

        key = DebounceKey("acc_123", "000001.SZ", AIProvider.OPENAI)
        debouncer.record_request(key)

        can_request, wait_time = debouncer.can_make_request(key)
        assert can_request is False
        assert wait_time <= 60


class TestTokenDebouncerIntegration:
    """Integration tests for TokenDebouncer."""

    def setup_method(self):
        """Reset debouncer before each test."""
        TokenDebouncer._instance = None
        TokenDebouncer._initialized = False

    def test_realistic_usage_scenario(self):
        """Test a realistic usage scenario."""
        debouncer = TokenDebouncer(min_interval_seconds=5)  # 5 seconds for testing

        account_id = "acc_trader_001"
        symbol = "000001.SZ"
        provider = AIProvider.OPENAI

        key = DebounceKey(account_id, symbol, provider)

        # First request - should be allowed
        can_request, wait_time = debouncer.can_make_request(key)
        assert can_request is True
        debouncer.record_request(key)

        # Immediate second request - should be blocked
        can_request, wait_time = debouncer.can_make_request(key)
        assert can_request is False
        assert wait_time > 0

        # Simulate time passing (6 seconds)
        debouncer._last_request_times[key] = datetime.now() - timedelta(seconds=6)

        # Request after interval - should be allowed
        can_request, wait_time = debouncer.can_make_request(key)
        assert can_request is True

    def test_multiple_accounts_and_symbols(self):
        """Test debouncer with multiple accounts and symbols."""
        debouncer = TokenDebouncer()

        # Simulate multiple accounts trading different stocks
        accounts = ["acc_001", "acc_002", "acc_003"]
        symbols = ["000001.SZ", "000002.SZ", "000003.SZ"]

        for i, account in enumerate(accounts):
            for j, symbol in enumerate(symbols):
                key = DebounceKey(account, symbol, AIProvider.OPENAI)
                # All first requests should be allowed
                assert debouncer.can_make_request(key)[0] is True
                debouncer.record_request(key)

        # Should have 9 records
        assert debouncer.get_stats()["total_records"] == 9
