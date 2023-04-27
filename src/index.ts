import { Request, RequestHandler, Router } from 'express'
import { glob } from 'glob'
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

interface EndpointModule extends Partial<Record<AllowedMethod, Endpoint>> {
  validation?: Partial<Record<AllowedMethod, Record<'body' | 'query', any>>>
  guestAccess?: boolean
  ensureAdmin?: boolean
  path: string // this is added by the router
  roles?: string[]
}

const getRoutePath = (path: string, routesPath: string) => {
  // get the endpoint path for express by removing the base filesystem path
  let routePath = path.replace(routesPath, '')
  // remove the js portion
  routePath = routePath.replace(/.js$/, '')
  // replace index at beggining with /
  routePath = routePath.replace(/^\/index/, '/')
  // remove index at end
  routePath = routePath.replace(/\/index$/, '')
  return routePath
}

interface IInitFsRoutingParams {
  ensureAdmin: RequestHandler
  ensureAuthenticated: RequestHandler
  routesPath: string
  logMounts?: boolean
  /** Returns an array of strings representing all the roles for the user who made this request */
  rolesResolver?: TRolesResolver
}

export const initFsRouting = async ({
  ensureAdmin,
  ensureAuthenticated,
  routesPath,
  logMounts = true,
  rolesResolver = () => [],
}: IInitFsRoutingParams) => {
  const router = Router({ caseSensitive: true })
  // Apply middleware first
  if (logMounts) {
    console.log('Mounting routes')
  }
  let numberOfRoutes = 0
  let numberOfFiles = 0
  let numberOfRoutesWithoutValidation = 0
  // Get all of the files under the routes directory
  const files = await getFiles(routesPath)
  numberOfFiles = files.length + 1
  // Sort by reverse alphabetical order, so items with colons are below items without colons. This makes it so we can override param routes.
  const modulePromises = files
    .sort()
    .reverse()
    .map(async path => {
      const routePath = getRoutePath(path, routesPath)
      // do not handle routes that begin with _
      const lastSlash = routePath.lastIndexOf('/')
      const endpointName = routePath.slice(lastSlash)

      if (endpointName.startsWith('/_')) {
        console.log('Skipping mounting:', routePath)
        return
      }

      // import route
      const module: EndpointModule = await import(path)

      module.path = routePath

      return module
    })
  const modules = await Promise.all(modulePromises)
  modules.map(module => {
    if (!module) return
    const routePath = getRoutePath(module.path, routesPath)
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

  if (process.env.NODE_ENV !== 'node') {
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
  let numberWithValidation = 0

  const validation = endpoints.validation
  const guestAccess = endpoints.guestAccess
  const adminOnly = endpoints.ensureAdmin
  const roles = endpoints.roles

  Object.entries(endpoints).map(([method, endpoint]: [string, Endpoint]) => {
    // skip exports that are not allowed Express methods
    const expressMethodName = method.toLowerCase()
    if (!isExpressMethod(expressMethodName)) {
      return
    }
    let handlers: RequestHandler[] = []
    if (!guestAccess) {
      handlers.push(ensureAuthenticated)

      if (adminOnly) {
        handlers.push(ensureAdmin)
      }
    }
    if (roles?.hasOwnProperty(method)) {
      if (isHttpMethod(method)) {
        handlers.push(createRolesMiddleware(roles[method], rolesResolver))
      }
    }
    let validationMsg = ''
    // check if it should have validation
    if (validation?.hasOwnProperty(method)) {
      if (isHttpMethod(method)) {
        const hasBody = validation[method]?.body
        const hasQuery = validation[method]?.query
        if (logMounts) {
          console.log(`\t | Mounting ${method} with validation`)
        }
        // verify that the validation object has the correct keys (query and body)
        if (hasQuery) {
          validationMsg = `\n\t\t | has query validation\n`
          // add optional key property to all validators
          const query = {
            ...validation[method]?.query,
            properties: {
              ...validation[method]?.query?.properties,
              key: { type: 'string', description: 'API Key' },
            },
          }
          // Add query validation handler
          handlers.push(
            createQueryValidator({
              query: query,
              // body: validation[method]?.body,
            })
          )
        }
        if (hasBody) {
          // Add body validation handler
          validationMsg += `\n\t\t | has body validation`
          handlers.push(
            createBodyValidator({
              body: validation[method]?.body,
            })
          )
        }
      }
    } else {
      // this endpoint doesn't have validation yet
      validationMsg += '- no validation'
      numberWithValidation++
    }

    const hasMiddleware = Array.isArray(endpoint)
    handlers = hasMiddleware
      ? [...handlers, ...endpoint]
      : [...handlers, endpoint]
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
    mounted++
  })
  return [mounted, numberWithValidation]
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

  const files = await glob(src + '/**/!(*.test).[tj]s', { nodir: true })
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
