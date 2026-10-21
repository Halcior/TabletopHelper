export function downloadJson(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
