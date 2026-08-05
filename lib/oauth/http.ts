import axios from 'axios'

// Shared HTTP client for all platform API calls. Without an explicit
// timeout, axios waits indefinitely and a hung platform (blackholed
// network, dead peer) leaves publish jobs stuck until the 30-minute
// stuck-publish recovery kicks in. 30s connect+response budget per call.
export const http = axios.create({
  timeout: 30_000,
})
