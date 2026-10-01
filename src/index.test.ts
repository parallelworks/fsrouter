import { getFiles, initFsRouting, UserFacingError } from '.'
import express from 'express'
import type { Request, RequestHandler, Response } from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import path from 'path'

// Express Route objects have a `methods` record at runtime
declare module 'express-serve-static-core' {
  interface IRoute {
    methods: Record<string, boolean>
  }
}
const testroutesPath = path.join(__dirname, 'testroutes')
const fullPath = relativePath => path.join(testroutesPath, relativePath)
const fixturePath = relativePath =>
  path.join(__dirname, 'testfixtures', relativePath)
const skipMiddleware: RequestHandler = (req, res, next) => next()

// servers are closed after each test, so that a failing test does not leave jest hanging
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(server => new Promise(done => server.close(done)))
  )
})

// mounts the routes on a real server, and returns a function that sends a request to it
const serve = async (
  params: Partial<Parameters<typeof initFsRouting>[0]> & { routesPath: string }
) => {
  const router = await initFsRouting({
    ensureAdmin: skipMiddleware,
    ensureAuthenticated: skipMiddleware,
    logMounts: false,
    ...params,
  })
  const app = express()
  app.use(router)
  const server = app.listen(0)
  servers.push(server)
  const { port } = server.address() as AddressInfo
  const request = async (url: string, method = 'GET') => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { router, request }
}
describe('routes', () => {
  it('should find all files in testroutes', async () => {
    const files = await getFiles(testroutesPath)
    const expectedFiles = [fullPath('index.ts'), fullPath('roles.ts')]
    // the order that the filesystem returns files in is not guaranteed
    expect(files.sort()).toEqual(expectedFiles)
  })

  it('should mount all routes in testroutes', async () => {
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath: testroutesPath,
      logMounts: false,
    })

    expect(router.stack).toHaveLength(3)
  })
  it('can hit the mounted route', async () => {
    const routesPath = fullPath('index.ts')
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath, // mount only the index.ts file
      logMounts: false,
    })

    const res = { json: jest.fn() } as unknown as Response
    const req = { method: 'GET' } as unknown as Request
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const route = router.stack[0]!.route!.stack[1]
    route.handle(req, res, next)
    expect(res.json).toHaveBeenCalledWith({ message: 'Hello World!' })
  })
})

describe('roles', () => {
  it('it rejects acess to routes requiring roles the user does not have', async () => {
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath: fullPath('roles.ts'), // mount only the roles.ts file
      logMounts: false,
    })

    const res = { json: jest.fn() } as unknown as Response
    const req = { method: 'POST' } as unknown as Request
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const post = router.stack.find(layer => layer.route?.methods.post)
    const route = post!.route!.stack[1]
    await route.handle(req, res, next)
    const error = new UserFacingError(
      'You do not have permission to access this resource',
      403
    )

    expect(next).toHaveBeenCalledWith(error)
  })
  it('it allows access to routes with roles that the user has', async () => {
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath: fullPath('roles.ts'), // mount only the roles.ts file
      logMounts: false,
      rolesResolver: () => ['org:admin', 'org:settings'],
    })

    const res = { json: jest.fn() } as unknown as Response
    const req = { method: 'POST' } as unknown as Request
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const route = router.stack.find(layer => layer.route?.methods.post)!.route!
      .stack[2]

    route.handle(req, res, next)

    expect(res.json).toHaveBeenCalledWith({
      message: 'Hello Authorized World!',
    })
  })
})

describe('route paths', () => {
  it('mounts static routes before param routes', async () => {
    const { router, request } = await serve({
      routesPath: fixturePath('ordering'),
    })
    const paths = router.stack.map(layer => layer.route!.path).flat()
    expect(paths).toEqual([
      '/users/me',
      '/users/2fa',
      '/users/:id',
      '/indexes',
      '/',
    ])

    expect((await request('/users/2fa')).body).toEqual({ route: 'users/2fa' })
    expect((await request('/users/me')).body).toEqual({ route: 'users/me' })
    expect((await request('/users/7')).body).toEqual({ route: 'users/:id' })
    expect((await request('/indexes')).body).toEqual({ route: 'indexes' })
    expect((await request('/')).body).toEqual({ route: 'index' })
    expect((await request('/_hidden')).status).toBe(404)
  })

  it('does not mount files in a folder that begins with _', async () => {
    const { request } = await serve({ routesPath: fixturePath('ordering') })
    expect((await request('/_lib/helper')).status).toBe(404)
  })

  it('does not return declaration files', async () => {
    const files = await getFiles(fixturePath('ordering'))
    expect(files.filter(file => file.endsWith('.d.ts'))).toEqual([])
  })
})

describe('route configuration', () => {
  it('applies roles and validation to lowercase method exports', async () => {
    const denied = await serve({ routesPath: fixturePath('lowercase.ts') })
    expect((await denied.request('/?name=a', 'POST')).status).toBe(403)

    const allowed = await serve({
      routesPath: fixturePath('lowercase.ts'),
      rolesResolver: () => ['org:admin'],
    })
    expect((await allowed.request('/', 'POST')).status).toBe(400)
    expect((await allowed.request('/?name=a', 'POST')).status).toBe(200)
  })

  it.each([
    ['rolesWithoutHandler.ts', 'no POST handler is exported'],
    ['rolesNotArray.ts', 'roles must be an array of role names'],
    ['guestAdmin.ts', 'guestAccess and ensureAdmin cannot both be set'],
    ['notAHandler.ts', 'GET must be a request handler'],
    ['validationWithoutHandler.ts', 'no POST handler is exported'],
    ['validationUnknownTarget.ts', 'validation.POST.Body is not supported'],
    ['validationNotSchema.ts', 'validation.GET.query must be a JSON schema'],
  ])('refuses to mount %s', async (file, message) => {
    await expect(
      serve({ routesPath: fixturePath(`invalid/${file}`) })
    ).rejects.toThrow(message)
  })

  it('refuses to start without auth middleware', async () => {
    await expect(
      serve({
        routesPath: testroutesPath,
        ensureAuthenticated: undefined as unknown as RequestHandler,
      })
    ).rejects.toThrow('must be middleware functions')
  })
})

describe('logging', () => {
  const spyOnConsole = () =>
    (['log', 'warn', 'error'] as const).map(level =>
      jest.spyOn(console, level).mockImplementation(() => {})
    )
  afterEach(() => jest.restoreAllMocks())

  it.each(['ordering', 'lowercase.ts', 'sync.ts'])(
    'prints nothing for %s when logMounts is false',
    async fixture => {
      const spies = spyOnConsole()
      await serve({ routesPath: fixturePath(fixture), logMounts: false })
      spies.forEach(spy => expect(spy).not.toHaveBeenCalled())
    }
  )

  it('does not warn about the middleware that fsrouter adds', async () => {
    const [log, warn, error] = spyOnConsole()
    // the route is async, but the auth middleware and the validators are not
    await serve({ routesPath: fixturePath('lowercase.ts'), logMounts: true })
    expect(log).toHaveBeenCalledWith('Mounting route:', '/')
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('warns once for each handler of a route that is not async', async () => {
    const [, warn, error] = spyOnConsole()
    await serve({ routesPath: fixturePath('sync.ts'), logMounts: true })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toContain('GET handler is not async')
    expect(error).not.toHaveBeenCalled()
  })
})
