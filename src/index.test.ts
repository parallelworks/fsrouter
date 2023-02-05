import { getFiles, initFsRouting } from '.'
import path from 'path'

const testroutesPath = path.join(__dirname, 'testroutes')
const fullPath = relativePath => path.join(testroutesPath, relativePath)
describe('routes', () => {
  it('should find all files in testroutes', async () => {
    const files = await getFiles(testroutesPath)

    const expectedFiles = [fullPath('index.ts')]
    expect(files).toEqual(expectedFiles)
  })

  it('should mount all routes in testroutes', async () => {
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath: testroutesPath,
      logMounts: false,
    })

    expect(router.stack).toHaveLength(1)
  })
  it('can hit the mounted route', async () => {
    const router = await initFsRouting({
      ensureAdmin: jest.fn(),
      ensureAuthenticated: jest.fn(),
      routesPath: fullPath(testroutesPath + '/index.ts'), // mount only the index.ts file
      logMounts: false,
    })

    const res = {
      json: jest.fn(),
    }
    const req = {
      method: 'GET',
    }
    const next = jest.fn()
    // its the only route, so its at index 1, middlware is at index 0
    const route = router.stack[0].route.stack[1]
    route.handle(req, res, next)
    expect(res.json).toHaveBeenCalledWith({ message: 'Hello World!' })
  })
})
