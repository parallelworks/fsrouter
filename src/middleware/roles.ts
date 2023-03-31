import { NextFunction, Request, Response } from 'express'
import { UserFacingError } from './errors'

export type TRolesResolver = (req: Request) => string[]

export const createRolesMiddleware = (
  roles: string[],
  rolesResolver: TRolesResolver
) => {
  // call the roles resolver, to get the roles for the current user
  // if the user has any of the roles required for this route, then call next()
  // otherwise, call next with a UserFacingError
  const rolesMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const userRoles = rolesResolver(req)
    console.log('roles', roles)
    const hasRole = userRoles.some(role => roles?.includes(role))
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
