import type { RequestHandler } from 'express'
// TODO: Change these to {} instead of any, which will make it more strict
export type Endpoint<
  RequestParams = Record<string, string>,
  RequestQuery = any,
  RequestBody = any,
  ResponseBody = any
> =
  | RequestHandler<RequestParams, ResponseBody, RequestBody, RequestQuery>
  | RequestHandler[]

export const AllowedMethods = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'ALL',
] as const
export type AllowedMethod = typeof AllowedMethods[number]
export const ExpressMethods = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'all',
] as const
export type ExpressMethod = typeof ExpressMethods[number]
