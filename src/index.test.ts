import { getFiles, initFsRouting } from '.'

describe('routes', () => {
  it('should find all files in testroutes', async () => {
    const files = await getFiles('./src/testroutes')

    expect(files).toEqual(['./src/testroutes/index.ts'])
  })
})
