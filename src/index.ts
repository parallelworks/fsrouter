import { RequestHandler, Router } from 'express'
import { glob } from 'glob'
import { resolve } from 'path'
import { asyncErrorHandler } from './middleware/errors'
import { createRolesMiddleware, TRolesResolver } from './middleware/roles'
import {
  AllowedMethod,
  AllowedMethods,
  Endpoint,
  ExpressMethod,
  ExpressMethods,
} from './types'
import { createBodyValidator, createQueryValidator } from './validation'

type TValidation = Partial<Record<'body' | 'query', any>>

interface EndpointModule extends Partial<Record<AllowedMethod, Endpoint>> {
  validation?: Partial<Record<AllowedMethod, TValidation>>
  guestAccess?: boolean
  ensureAdmin?: boolean
  roles?: Partial<Record<AllowedMethod, string[]>>
}

const getRoutePath = (path: string, routesPath: string) => {
  // get the endpoint path for express by removing the base filesystem path
  let routePath = path.startsWith(routesPath)
    ? path.slice(routesPath.length)
    : path
  // remove the file extension
  routePath = routePath.replace(/\.(js|ts)$/, '')
  // a top level index file is the root route
  routePath = routePath.replace(/^\/index$/, '/')
  // remove index at end
  routePath = routePath.replace(/\/index$/, '')
  return routePath
}

// Reverse alphabetical order, except that a static segment always sorts above a param segment.
// This makes it so we can override param routes, e.g. /users/me is mounted before /users/:id
const compareRoutePaths = (a: string, b: string) => {
  const aSegments = a.split('/')
  const bSegments = b.split('/')
  const length = Math.min(aSegments.length, bSegments.length)
  for (let i = 0; i < length; i++) {
    const aSegment = aSegments[i]
    const bSegment = bSegments[i]
    if (aSegment === bSegment) continue
    const aIsParam = aSegment.startsWith(':')
    if (aIsParam !== bSegment.startsWith(':')) {
      return aIsParam ? 1 : -1
    }
    return aSegment < bSegment ? 1 : -1
  }
  return bSegments.length - aSegments.length
}

interface IInitFsRoutingParams {
  ensureAdmin: RequestHandler
  ensureAuthenticated: RequestHandler
  routesPath: string
  logMounts?: boolean
  /** Returns an array of strings representing all the roles for the user who made this request */
  rolesResolver?: TRolesResolver
}

export const initFsRouting: (
  params: IInitFsRoutingParams
) => Promise<Router> = async ({
  ensureAdmin,
  ensureAuthenticated,
  routesPath,
  logMounts = true,
  rolesResolver = () => [],
}) => {
  // the auth middleware guards every route, so refuse to start without it
  if (
    typeof ensureAuthenticated !== 'function' ||
    typeof ensureAdmin !== 'function'
  ) {
    throw new TypeError(
      'ensureAuthenticated and ensureAdmin must be middleware functions'
    )
  }
  const router = Router({ caseSensitive: true })
  // Apply middleware first
  if (logMounts) {
    console.log('Mounting routes')
  }
  let numberOfRoutes = 0
  let numberOfRoutesWithoutValidation = 0
  // resolve relative paths against the working directory, the same way the files are imported
  const root = resolve(routesPath)
  // Get all of the files under the routes directory
  const files = await getFiles(root)
  const numberOfFiles = files.length
  const modulePromises = files
    .sort()
    .map(path => ({ path, routePath: getRoutePath(path, root) }))
    .sort((a, b) => compareRoutePaths(a.routePath, b.routePath))
    .map(async ({ path, routePath }) => {
      // do not handle routes that begin with _
      const lastSlash = routePath.lastIndexOf('/')
      const endpointName = routePath.slice(lastSlash)

      if (endpointName.startsWith('/_')) {
        if (logMounts) {
          console.log('Skipping mounting:', routePath)
        }
        return
      }

      // import route
      const module: EndpointModule = await import(path)

      return { module, routePath }
    })
  const modules = await Promise.all(modulePromises)
  modules.map(mod => {
    if (!mod) return
    const { module, routePath } = mod
    // here we have the chance to alias routes to different locations, by storing multiple paths in routePaths
    const routePaths = [routePath]

    // we treat authentication differently on u routes and API routes, can get rid of this when client is separted from API server
    if (logMounts) {
      console.log(`Mounting route:`, routePaths[0])
    }
    const [routesMounted, routesWithoutValidation] = mountEndpoints({
      paths: routePaths,
      endpoints: module,
      ensureAdmin,
      ensureAuthenticated,
      logMounts,
      router,
      rolesResolver,
    })
    numberOfRoutes += routesMounted
    numberOfRoutesWithoutValidation += routesWithoutValidation
    if (routesMounted === 0 && logMounts)
      console.log('\t | No exported HTTP methods')
  })

  if (logMounts) {
    console.log(
      `${numberOfFiles} route files processed, ${numberOfRoutes} routes mounted, ${numberOfRoutesWithoutValidation} routes do not have validation.`
    )
  }

  return router
}

// Returns the number of routes mounted, and the number of routes that had validation
interface IMountEndpointsParams {
  paths: string[]
  endpoints: EndpointModule
  ensureAdmin: RequestHandler
  ensureAuthenticated: RequestHandler
  logMounts: boolean
  router: Router
  rolesResolver: TRolesResolver
}

// Reads a per-method export (roles, validation), matching the keys to HTTP methods regardless of case.
// A key that is not an HTTP method would otherwise be ignored silently, so it is rejected instead.
const getMethodConfig = <T>(
  name: 'roles' | 'validation',
  config: unknown,
  path: string
): Partial<Record<AllowedMethod, T>> => {
  const methodConfig: Partial<Record<AllowedMethod, T>> = {}
  if (config === undefined) {
    return methodConfig
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new TypeError(
      `${path}: ${name} must be an object keyed by HTTP method`
    )
  }
  Object.entries(config).forEach(([key, value]) => {
    const method = key.toUpperCase()
    if (!isHttpMethod(method)) {
      throw new TypeError(`${path}: ${name}.${key} is not an HTTP method`)
    }
    methodConfig[method] = value
  })
  return methodConfig
}

const mountEndpoints = ({
  paths,
  endpoints,
  ensureAdmin,
  ensureAuthenticated,
  logMounts = true,
  router,
  rolesResolver,
}: IMountEndpointsParams): [number, number] => {
  let mounted = 0
  let numberWithoutValidation = 0
  const path = paths[0]

  const validation = getMethodConfig<TValidation>(
    'validation',
    endpoints.validation,
    path
  )
  const roles = getMethodConfig<string[]>('roles', endpoints.roles, path)
  const guestAccess = endpoints.guestAccess
  const adminOnly = endpoints.ensureAdmin
  // a value like 'false' is truthy, so only accept real booleans for the access exports
  if (guestAccess !== undefined && typeof guestAccess !== 'boolean') {
    throw new TypeError(`${path}: guestAccess must be a boolean`)
  }
  if (adminOnly !== undefined && typeof adminOnly !== 'boolean') {
    throw new TypeError(`${path}: ensureAdmin must be a boolean`)
  }
  if (guestAccess && adminOnly) {
    throw new TypeError(
      `${path}: guestAccess and ensureAdmin cannot both be set`
    )
  }
  const mountedMethods = new Set<string>()

  Object.entries(endpoints).map(([method, endpoint]: [string, Endpoint]) => {
    // skip exports that are not allowed Express methods
    const expressMethodName = method.toLowerCase()
    if (!isExpressMethod(expressMethodName)) {
      return
    }
    // roles and validation apply to the method however the export is cased
    const httpMethod = method.toUpperCase() as AllowedMethod
    const endpointHandlers = Array.isArray(endpoint) ? endpoint : [endpoint]
    if (
      endpointHandlers.length === 0 ||
      !endpointHandlers.every(handler => typeof handler === 'function')
    ) {
      throw new TypeError(
        `${path}: ${method} must be a request handler or an array of request handlers`
      )
    }
    let handlers: RequestHandler[] = []
    if (!guestAccess) {
      handlers.push(ensureAuthenticated)

      if (adminOnly) {
        handlers.push(ensureAdmin)
      }
    }
    const requiredRoles = roles[httpMethod]
    if (requiredRoles !== undefined) {
      handlers.push(createRolesMiddleware(requiredRoles, rolesResolver))
    }
    let validationMsg = ''
    const methodValidation = validation[httpMethod]
    // check if it should have validation
    if (methodValidation) {
      const hasBody = methodValidation.body
      const hasQuery = methodValidation.query
      if (logMounts) {
        console.log(`\t | Mounting ${method} with validation`)
      }
      // verify that the validation object has the correct keys (query and body)
      if (hasQuery) {
        validationMsg = `\n\t\t | has query validation\n`
        // add optional key property to all validators
        const query = {
          ...methodValidation.query,
          properties: {
            ...methodValidation.query?.properties,
            key: { type: 'string', description: 'API Key' },
          },
        }
        // Add query validation handler
        handlers.push(
          createQueryValidator({
            query: query,
          })
        )
      }
      if (hasBody) {
        // Add body validation handler
        validationMsg += `\n\t\t | has body validation`
        handlers.push(
          createBodyValidator({
            body: methodValidation.body,
          })
        )
      }
    } else {
      // this endpoint doesn't have validation yet
      validationMsg += '- no validation'
      numberWithoutValidation++
    }

    handlers = [...handlers, ...endpointHandlers]
    // loop over handlers and print warnings if they are not async
    handlers.forEach(handler => {
      if (handler.constructor.name !== 'AsyncFunction' && logMounts) {
        console.error(`\t ⛔️ Warning: ${method} handler is not async. `)
      }
    })
    // add async handling to all handlers
    handlers = handlers.map(handler => asyncErrorHandler(handler))

    // mount the route
    router[expressMethodName](paths, handlers)
    if (logMounts) {
      console.log(`\t | ${method} ${validationMsg}`)
    }
    mountedMethods.add(httpMethod)
    mounted++
  })

  // roles that are not attached to a handler protect nothing, which is most likely a typo
  Object.keys(roles).forEach(method => {
    if (!mountedMethods.has(method)) {
      throw new TypeError(
        `${path}: roles are set for ${method} but no ${method} handler is exported`
      )
    }
  })
  Object.keys(validation).forEach(method => {
    if (!mountedMethods.has(method)) {
      console.warn(
        `${path}: validation is set for ${method} but no ${method} handler is exported`
      )
    }
  })
  return [mounted, numberWithoutValidation]
}

const isExpressMethod = (method: string): method is ExpressMethod => {
  return ExpressMethods.includes(method as ExpressMethod)
}

const isHttpMethod = (exportKey: string): exportKey is AllowedMethod => {
  return AllowedMethods.includes(exportKey as AllowedMethod)
}

const getFiles = async (src: string) => {
  // if we're trying to mount a single file, just return src
  if (src.endsWith('.ts') || src.endsWith('.js')) {
    return [src]
  }

  // glob relative to src, so that special characters in the path to the routes are not treated as a pattern
  const files = await glob('**/*.{ts,js}', {
    cwd: src,
    absolute: true,
    nodir: true,
    ignore: ['**/*.test.{ts,js}', '**/*.d.ts'],
  })
  return files
}

// Expose library
export { FromSchema } from 'json-schema-to-ts'
export {
  defaultErrorHandler,
  UserFacingError,
  userFacingErrorHandler,
} from './middleware/errors'
export { Endpoint } from './types'
export { getFiles }
