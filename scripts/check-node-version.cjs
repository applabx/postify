const minMajor = 20
const minMinor = 9
const [major, minor] = process.versions.node.split('.').map(Number)

if (major < minMajor || (major === minMajor && minor < minMinor)) {
  console.error(
    `Node ${minMajor}.${minMinor}.0+ is required. Current: ${process.versions.node}.`
  )
  process.exit(1)
}
