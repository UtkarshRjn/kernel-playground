// Kernel Playground — injected benchmark driver (§4).
//
// We OWN the timing so measurements are trustworthy regardless of what the user writes.
// The user's .cu must define `kp_run()` (one iteration of the workload, i.e. a kernel
// launch). `kp_setup()` / `kp_teardown()` are optional (weak symbols) for one-time
// allocation so memory setup is never counted in the timed region.
//
// Rigor applied here: warmup iterations, L2-cache flush before each timed iteration,
// CUDA-event timing (not wall clock), and per-iteration samples emitted as JSON for the
// Python side to aggregate (median / p95 / stddev).

#include <cstdio>
#include <cstdlib>
#include <vector>
#include <cuda_runtime.h>

extern "C" {
void kp_run();
void kp_setup() __attribute__((weak));
void kp_teardown() __attribute__((weak));
}

static int env_int(const char* name, int fallback) {
  const char* v = getenv(name);
  return v ? atoi(v) : fallback;
}

#define KP_CHECK(expr)                                                              \
  do {                                                                              \
    cudaError_t _e = (expr);                                                        \
    if (_e != cudaSuccess) {                                                        \
      fprintf(stderr, "CUDA error %s at %s:%d\n", cudaGetErrorString(_e), __FILE__, \
              __LINE__);                                                            \
      return 2;                                                                     \
    }                                                                               \
  } while (0)

int main() {
  const int warmup = env_int("KP_WARMUP", 10);
  const int iters = env_int("KP_ITERS", 50);
  const int flush_l2 = env_int("KP_FLUSH_L2", 1);

  int device = 0;
  KP_CHECK(cudaGetDevice(&device));
  cudaDeviceProp prop;
  KP_CHECK(cudaGetDeviceProperties(&prop, device));

  // Buffer sized to the L2 cache; memset evicts cached data between timed iterations.
  int l2_bytes = prop.l2CacheSize > 0 ? prop.l2CacheSize : (4 << 20);
  unsigned char* l2_buf = nullptr;
  if (flush_l2) KP_CHECK(cudaMalloc(&l2_buf, l2_bytes));

  if (kp_setup) kp_setup();

  // Warmup — absorb one-time JIT/allocation costs, not measured.
  for (int i = 0; i < warmup; ++i) kp_run();
  KP_CHECK(cudaDeviceSynchronize());

  cudaEvent_t start, stop;
  KP_CHECK(cudaEventCreate(&start));
  KP_CHECK(cudaEventCreate(&stop));

  std::vector<float> samples;
  samples.reserve(iters);
  for (int i = 0; i < iters; ++i) {
    if (flush_l2) KP_CHECK(cudaMemset(l2_buf, i & 0xff, l2_bytes));
    KP_CHECK(cudaEventRecord(start));
    kp_run();
    KP_CHECK(cudaEventRecord(stop));
    KP_CHECK(cudaEventSynchronize(stop));
    float ms = 0.0f;
    KP_CHECK(cudaEventElapsedTime(&ms, start, stop));
    samples.push_back(ms);
  }

  // Surface any error from the kernel launches themselves.
  cudaError_t launch_err = cudaGetLastError();
  if (launch_err != cudaSuccess) {
    fprintf(stderr, "CUDA error %s after kernel launches\n", cudaGetErrorString(launch_err));
    return 2;
  }

  if (kp_teardown) kp_teardown();
  if (l2_buf) cudaFree(l2_buf);

  // Machine-readable result line consumed by cuda_runner.py.
  printf("KP_RESULT {\"device\":\"%s\",\"samples_ms\":[", prop.name);
  for (size_t i = 0; i < samples.size(); ++i) {
    printf("%s%.6f", i ? "," : "", samples[i]);
  }
  printf("]}\n");
  return 0;
}
