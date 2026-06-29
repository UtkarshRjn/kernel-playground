from execution.benchmark import percentile, run_benchmark, summarize
from execution.contracts import BenchmarkConfig


def test_percentile_basic() -> None:
    data = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert percentile(data, 0) == 1.0
    assert percentile(data, 100) == 5.0
    assert percentile(data, 50) == 3.0


def test_percentile_interpolates() -> None:
    assert percentile([10.0, 20.0], 95) == 19.5


def test_summarize_single_sample_zero_stddev() -> None:
    stats = summarize([7.0])
    assert stats.mean_ms == 7.0
    assert stats.median_ms == 7.0
    assert stats.min_ms == 7.0
    assert stats.p95_ms == 7.0
    assert stats.stddev_ms == 0.0
    assert stats.iters == 1


def test_summarize_fields() -> None:
    stats = summarize([2.0, 4.0, 6.0, 8.0])
    assert stats.min_ms == 2.0
    assert stats.mean_ms == 5.0
    assert stats.iters == 4
    assert stats.stddev_ms > 0


def test_run_benchmark_runs_warmup_then_timed() -> None:
    calls = {"n": 0}

    def measure() -> float:
        calls["n"] += 1
        return 1.5

    config = BenchmarkConfig(warmup_iters=3, timed_iters=10)
    stats = run_benchmark(measure, config)

    assert calls["n"] == 13  # 3 warmup + 10 timed
    assert stats.iters == 10
    assert stats.mean_ms == 1.5
