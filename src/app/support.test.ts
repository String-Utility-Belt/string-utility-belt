import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GITHUB_SPONSORS_URL } from './support'

const root = path.resolve(__dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('GitHub Sponsors', () => {
  const account = /^https:\/\/github\.com\/sponsors\/([A-Za-z0-9-]+)$/.exec(GITHUB_SPONSORS_URL)?.[1]

  it('is one account, named the same in the repository\'s FUNDING.yml', () => {
    expect(account).toBeTruthy()
    expect(read('.github/FUNDING.yml')).toMatch(new RegExp(`^github: \\[${account}\\]$`, 'm'))
  })

  it('is the page the about page and the README link', () => {
    expect(read('src/app/pages/content/about.md')).toContain(`(${GITHUB_SPONSORS_URL})`)
    expect(read('README.md')).toContain(`(${GITHUB_SPONSORS_URL})`)
  })
})
