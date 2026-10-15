## synthetic-data check of the phase-agnostic MAF mixture MLE (synthetic data allowed in tests)
grid <- seq(0, 0.5, by = 0.01)
mle <- function(a, d) { ll <- vapply(grid, function(p) sum(log(0.5*dbinom(a,d,p)+0.5*dbinom(a,d,1-p)+1e-300)), 0); grid[which.max(ll)] }
set.seed(1)
d <- rep(30, 200); ph <- sample(c(TRUE, FALSE), 200, TRUE)
a <- rbinom(200, d, ifelse(ph, 0.2, 0.8)); stopifnot(abs(mle(pmin(a, d - a), d) - 0.2) <= 0.03)
a <- rbinom(200, d, 0.5); stopifnot(mle(pmin(a, d - a), d) >= 0.47)
cat("ok\n")
