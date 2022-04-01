import type { RequestHandler } from 'express'
// TODO: Change these to {} instead of any, which will make it more strict
export type Endpoint<
  RequestParams extends Record<string, string> = any,
  RequestQuery = any,
  RequestBody = any,
  ResponseBody = any
> =
  | RequestHandler<RequestParams, RequestQuery, RequestBody, ResponseBody>
  | RequestHandler[]

export const AllowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type AllowedMethod = typeof AllowedMethods[number]
export const ExpressMethods = ['get', 'post', 'put', 'patch', 'delete'] as const
export type ExpressMethod = typeof ExpressMethods[number]

export interface ISession {
  id: string
}