import { getFiles, initFsRouting } from '.'
import path from 'path'

const testroutesPath = path.join(__dirname, 'testroutes')
describe('routes', () => {
  it('should find all files in testroutes', async () => {
    const files = await getFiles(testroutesPath)
    const fullPath = relativePath => path.join(testroutesPath, relativePath)
    const expectedFiles = [fullPath('index.ts')]
    expect(files).toEqual(expectedFiles)
  })
})
