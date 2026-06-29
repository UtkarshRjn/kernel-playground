// Example CUDA submission for the Kernel Playground benchmark harness.
//
// Contract: define `kp_run()` (one iteration of work). Optionally define `kp_setup()`
// / `kp_teardown()` for one-time allocation so memory ops aren't counted in timing.
// All three must be `extern "C"` so the injected driver (kp_main.cu) can find them.

#include <cuda_runtime.h>

#define N (1 << 22) // ~4M elements

static float *dA = nullptr, *dB = nullptr, *dC = nullptr;

__global__ void vadd(const float* a, const float* b, float* c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) c[i] = a[i] + b[i];
}

extern "C" void kp_setup() {
  cudaMalloc(&dA, N * sizeof(float));
  cudaMalloc(&dB, N * sizeof(float));
  cudaMalloc(&dC, N * sizeof(float));
  cudaMemset(dA, 1, N * sizeof(float));
  cudaMemset(dB, 2, N * sizeof(float));
}

extern "C" void kp_run() {
  const int threads = 256;
  const int blocks = (N + threads - 1) / threads;
  vadd<<<blocks, threads>>>(dA, dB, dC, N);
}

extern "C" void kp_teardown() {
  cudaFree(dA);
  cudaFree(dB);
  cudaFree(dC);
}
