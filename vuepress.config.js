const { defaultTheme } = require('@vuepress/theme-default')

module.exports = {
  title: 'tldr',
  base: './',
  dest: 'dist/tldr.docset',
  theme: defaultTheme({
    navbar: false,
    sidebar: false
  })
}