import { asyncErrorHandler } from './middleware/errors'
import { createBodyValidator, createQueryValidator } from './validation'
import {
  AllowedMethod,
  AllowedMethods,
  Endpoint,
  ExpressMethod,
  ExpressMethods,
} from './types'
import { RequestHandler, Router } from 'express'
import globCb from 'glob'
import { promisify } from 'util'

const router = Router()
const glob = promisify(globCb)

interface EndpointModule extends Partial<Record<AllowedMethod, Endpoint>> {
  validation?: Partial<Record<AllowedMethod, Record<'body' | 'query', any>>>
  guestAccess?: boolean
  ensureAdmin?: boolean
}

interface IInitFsRoutingParams {
  ensureAdmin: RequestHandler
  ensureAuthenticated: RequestHandler
  routesPath: string
}

export const initFsRouting = async ({
  ensureAdmin,
  ensureAuthenticated,
  routesPath,
}: IInitFsRoutingParams) => {
  // Apply middleware first
  console.log('Mounting routes')
  let numberOfRoutes = 0
  let numberOfFiles = 0
  let numberOfRoutesWithoutValidation = 0
  // Get all of the files under the routes directory
  const files = await getFiles(routesPath)
  numberOfFiles = files.length + 1
  // Sort by reverse alphabetical order, so items with colons are below items without colons. This makes it so we can override param routes.
  const promises = files
    .sort()
    .reverse()
    .map(async path => {
      // get the endpoint path for express by removing the base filesystem path
      let routePath = path.replace(routesPath, '')
      // remove the js portion
      routePath = routePath.replace(/.js$/, '')
      // replace index at beggining with /
      routePath = routePath.replace(/^\/index/, '/')
      // remove index at end
      routePath = routePath.replace(/\/index$/, '')
      // do not handle routes that begin with _
      const lastSlash = routePath.lastIndexOf('/')
      const endpointName = routePath.substr(lastSlash)

      if (endpointName.startsWith('/_')) {
        console.log('Skipping mounting:', routePath)
        return
      }

      // import route
      const module: EndpointModule = await import(path)
      // here we have the chance to alias routes to different locations, by storing multiple paths in routePaths
      const routePaths = [routePath]

      // we treat authentication differently on u routes and API routes, can get rid of this when client is separted from API server

      console.log(`Mounting route:`, routePaths[0])
      const [routesMounted, routesWithoutValidation] = mountEndpoints({
        paths: routePaths,
        endpoints: module,
        ensureAdmin,
        ensureAuthenticated,
      })
      numberOfRoutes += routesMounted
      numberOfRoutesWithoutValidation += routesWithoutValidation
      if (routesMounted === 0) console.log('\t | No exported HTTP methods')
    })
  await Promise.all(promises).then(() =>
    console.log(
      `${numberOfFiles} route files processed, ${numberOfRoutes} routes mounted, ${numberOfRoutesWithoutValidation} routes do not have validation.`
    )
  )
  return router
}

// Returns the number of routes mounted, and the number of routes that had validation
interface IMountEndpointsParams {
  paths: string[]
  endpoints: EndpointModule
  ensureAdmin: RequestHandler
  ensureAuthenticated: RequestHandler
}

const mountEndpoints = ({
  paths,
  endpoints,
  ensureAdmin,
  ensureAuthenticated,
}: IMountEndpointsParams): [number, number] => {
  let mounted = 0
  let numberWithValidation = 0

  const validation = endpoints.validation
  const guestAccess = endpoints.guestAccess
  const adminOnly = endpoints.ensureAdmin

  Object.entries(endpoints).map(([method, endpoint]) => {
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
    let validationMsg = ''
    // check if it should have validation
    if (validation?.hasOwnProperty(method)) {
      if (isHttpMethod(method)) {
        const hasBody = validation[method]?.body
        const hasQuery = validation[method]?.query
        console.log(`\t | Mounting ${method} with validation`)
        // verify that the validation object has the correct keys (query and body)
        if (hasQuery) {
          validationMsg = `\t | ${method} has query validation\n`
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
          validationMsg += `\t | ${method} has body validation`
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
    // add async handling to all handlers
    handlers = handlers.map(handler => asyncErrorHandler(handler))
    // mount the route
    router[expressMethodName](paths, handlers)
    console.log(`\t | ${method} ${validationMsg}`)
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
  return glob(src + '/**/*.js', { nodir: true })
}

// Expose library
export {
  UserFacingError,
  defaultErrorHandler,
  userFacingErrorHandler,
} from './middleware/errors'
export { Endpoint } from './types'
// TODO: Add FromSchema to this library and expose from here
export default router
