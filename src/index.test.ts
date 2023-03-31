import { getFiles, initFsRouting, UserFacingError } from '.'
import path from 'path'
const testroutesPath = path.join(__dirname, 'testroutes')
const fullPath = relativePath => path.join(testroutesPath, relativePath)
describe('routes', () => {
  it('should find all files in testroutes', async () => {
    const files = await getFiles(testroutesPath)
    const expectedFiles = [fullPath('roles.ts'), fullPath('index.ts')]
    expect(files).toEqual(expectedFiles)
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

    const res = {
      json: jest.fn(),
    }
    const req = {
      method: 'GET',
    }
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const route = router.stack[0].route.stack[1]
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

    const res = {
      json: jest.fn(),
    }
    const req = {
      method: 'POST',
    }
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const post = router.stack.find(layer => layer.route.methods.post)
    const route = post.route.stack[1]
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

    const res = {
      json: jest.fn(),
    }
    const req = {
      method: 'POST',
    }
    const next = jest.fn()
    // its the only route so its at index 0 of the router
    const route = router.stack.find(layer => layer.route.methods.post).route
      .stack[2]

    route.handle(req, res, next)

    expect(res.json).toHaveBeenCalledWith({
      message: 'Hello Authorized World!',
    })
  })
})
