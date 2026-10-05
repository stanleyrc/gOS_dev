"""Small statistics toolkit (standard library only).

Wilcoxon rank-sum with tie correction and continuity correction (as R's
wilcox.test(correct = TRUE) with the normal approximation), multiple-testing
adjustment, and hypergeometric tail probabilities for enrichment.
"""

import math


def wilcoxon_ranksum(a_nonzero, n_a_zero, b_nonzero, n_b_zero):
    """Two-sided rank-sum p-value for two samples given as non-zero values
    plus zero counts (single-cell data is mostly zeros, so zeros are handled
    as one tie block without materialising them).

    Returns (p_value, auc) where auc = U / (n_a * n_b) is the probability a
    random A value exceeds a random B value (ties count half).
    """
    n_a = len(a_nonzero) + n_a_zero
    n_b = len(b_nonzero) + n_b_zero
    n = n_a + n_b
    if n_a == 0 or n_b == 0:
        return 1.0, 0.5

    tie_term = 0.0
    rank_sum_a = 0.0
    n_zero = n_a_zero + n_b_zero
    if n_zero:
        avg_rank_zero = (n_zero + 1) / 2.0
        rank_sum_a += n_a_zero * avg_rank_zero
        tie_term += n_zero ** 3 - n_zero

    merged = [(v, 1) for v in a_nonzero] + [(v, 0) for v in b_nonzero]
    merged.sort(key=lambda t: t[0])
    i = 0
    next_rank = n_zero + 1
    m = len(merged)
    while i < m:
        j = i
        value = merged[i][0]
        while j < m and merged[j][0] == value:
            j += 1
        size = j - i
        avg_rank = next_rank + (size - 1) / 2.0
        in_a = sum(flag for _, flag in merged[i:j])
        rank_sum_a += in_a * avg_rank
        if size > 1:
            tie_term += size ** 3 - size
        next_rank += size
        i = j

    u = rank_sum_a - n_a * (n_a + 1) / 2.0
    mean = n_a * n_b / 2.0
    var = n_a * n_b / 12.0 * ((n + 1) - tie_term / (n * (n - 1)))
    auc = u / (n_a * n_b)
    if var <= 0:
        return 1.0, auc
    diff = u - mean
    correction = 0.5 if diff > 0 else (-0.5 if diff < 0 else 0.0)
    z = (diff - correction) / math.sqrt(var)
    p = math.erfc(abs(z) / math.sqrt(2.0))
    return min(1.0, p), auc


def bonferroni(p_values, n_tests):
    return [min(1.0, p * n_tests) for p in p_values]


def benjamini_hochberg(p_values):
    """BH-adjusted q-values, in the input order."""
    n = len(p_values)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda k: p_values[k])
    q = [0.0] * n
    running = 1.0
    for rank in range(n, 0, -1):
        k = order[rank - 1]
        running = min(running, p_values[k] * n / rank)
        q[k] = min(1.0, running)
    return q


def _log_choose(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def hypergeom_sf(k, population, successes, draws):
    """P(X >= k) for X ~ Hypergeometric(population, successes, draws)."""
    lo = max(k, 0)
    hi = min(successes, draws)
    if lo > hi:
        return 0.0
    denom = _log_choose(population, draws)
    terms = [
        _log_choose(successes, x) + _log_choose(population - successes, draws - x) - denom
        for x in range(lo, hi + 1)
    ]
    top = max(terms)
    return min(1.0, math.exp(top) * sum(math.exp(t - top) for t in terms))
