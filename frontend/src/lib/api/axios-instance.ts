import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { mockResponse } from "@/lib/api/mock";

/**
 * Shared axios instance for the orval-generated client.
 * Paths in the OpenAPI doc already include `/api`, so baseURL is just the origin:
 *  - dev: NEXT_PUBLIC_API_BASE_URL=http://localhost:5258 (FE :3000 → API :5258, same-site cookie)
 *  - prod: "" (same origin, behind Caddy)
 */
export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  withCredentials: true,
});

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const mocked = mockResponse(config);
  if (mocked) return mocked as Promise<T>;

  const source = axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // react-query cancellation hook
  // @ts-expect-error attach cancel
  promise.cancel = () => source.cancel("Query was cancelled");

  return promise;
};

export type ErrorType<E> = AxiosError<E>;
export type BodyType<B> = B;

export default customInstance;
