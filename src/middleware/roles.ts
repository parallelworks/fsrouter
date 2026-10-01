import { NextFunction, Request, Response } from 'express'
import { UserFacingError } from './errors'

export type TRolesResolver = (req: Request) => Promise<string[]> | string[]

export const createRolesMiddleware = (
  roles: string[],
  rolesResolver: TRolesResolver
) => {
  // a string would be matched by substring, so only accept a list of role names
  if (!Array.isArray(roles) || !roles.every(role => typeof role === 'string')) {
    throw new TypeError('roles must be an array of role names')
  }
  // call the roles resolver, to get the roles for the current user
  // if the user has any of the roles required for this route, then call next()
  // otherwise, call next with a UserFacingError
  const rolesMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const userRoles = await rolesResolver(req)
    // @ts-ignore
    req.roles = userRoles
    const hasRole =
      Array.isArray(userRoles) && userRoles.some(role => roles.includes(role))
    if (hasRole) {
      next()
    } else {
      next(
        new UserFacingError(
          'You do not have permission to access this resource',
          403
        )
      )
    }
  }
  return rolesMiddleware
}
