import fs from 'fs/promises'
import path from 'path'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import MarkdownIt from 'markdown-it'
import mkdirp from 'mkdirp'


async function generateResource(name, rootPath) {
  // plist
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>${name}</string>
    <key>CFBundleName</key>
    <string>${name}</string>
    <key>DocSetPlatformFamily</key>
    <string>${name}</string>
    <key>isDashDocset</key>
    <true/>
  </dict>
  </plist>`
  const plistPath = path.join(rootPath, 'Contents/Info.plist')
  await fs.writeFile(plistPath, plist)

  // icon
  const originLogoPath = path.join('.', 'tldr/images/logo.png')
  await fs.copyFile(originLogoPath, path.join(rootPath, 'icon.png'))

  //
}

async function generateDatabase(rootPath) {
  const db = await open({
    filename: path.join(rootPath, 'Contents/Resources/docSet.dsidx'),
    // mode: sqlite3.OPEN_CREATE,
    driver: sqlite3.Database
  })

  await db.exec('CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);')
  // await db.exec('CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);')
  await db.exec('CREATE UNIQUE INDEX anchor ON searchIndex (path);')

  const folders = await fs.readdir(path.join(rootPath, 'Contents/Resources/Documents'), { withFileTypes: true })
  for (const f of folders) {
    if (!f.isDirectory()) return
    const curPath = path.join(rootPath, 'Contents/Resources/Documents', f.name)
    let files = await fs.readdir(curPath, { withFileTypes: true })
    files = files.filter(file => file.name.endsWith('.html') && file.isFile())
    // const statement = await db.prepare("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?);")
    await db.run('begin transaction')
    for (const file of files) {
      const name = file.name.split('.')[0]
      const type = f.name
      const path = `${f.name}/${file.name}`
      try {
        await db.run("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?);", name, type, path)
      } catch (e) {
        console.error(`filename: ${f.name}, parameters: `, name, type, path)
        console.error(e)
      }
    }
    await db.run('commit')
  }
  await db.close()
}

function renderHtmlTpl(title, body) {
  const htmlTpl = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link href="./bootstrap.min.css" rel="stylesheet">
  </head>
  <body>
    ${body}
  </body>
</html>
`
  return htmlTpl
}

async function copyBootstrap(distPath) {
  const sourcePath = path.resolve('.', 'node_modules/bootstrap/dist/css/bootstrap.min.css')
  await fs.copyFile(sourcePath, path.join(distPath, 'bootstrap.min.css'))
}

async function generateHtml(pagesName, distPath) {
  const md = new MarkdownIt()
  const pagesPath = path.join('./tldr', pagesName)
  const folders = await fs.readdir(pagesPath, { withFileTypes: true })

  await Promise.all(folders.filter(f => f.isDirectory()).map(async f => {
    const folderPath = path.join(distPath, f.name)
    await mkdirp(folderPath)
    copyBootstrap(folderPath)
    const files = (await fs.readdir(path.join(pagesPath, f.name), { withFileTypes: true })).filter(file => file.name.endsWith('.md'))
    await Promise.all(files.map(async file => {
      const content = await fs.readFile(path.join(pagesPath, f.name, file.name), 'utf8')
      const res = md.render(content)
      const name = file.name.split('.')[0]
      await fs.writeFile(path.join(distPath, f.name, `${name}.html`), renderHtmlTpl(name, res))
    }))
  }))
}

async function generate(pagesName) {
  const rootPath = path.resolve('.', 'dist/tldr.docset')
  const docPath = path.join(rootPath, 'Contents/Resources/Documents')

  await mkdirp(docPath)

  await generateHtml(pagesName, docPath)

  await Promise.all([
    generateResource('tldr', rootPath),
    generateDatabase(rootPath)
  ])
}

generate('pages').catch(e => {
  console.error(e)
})
