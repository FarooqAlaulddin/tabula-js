import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const milestoneDir = dirname(fileURLToPath(import.meta.url))
const backlogDir = join(milestoneDir, 'backlog')
const planPath = join(milestoneDir, 'PLAN.md')
const errors = []

function field(source, name) {
	return source.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]
}

function parseDependencies(raw, file) {
	if (!raw?.startsWith('[') || !raw.endsWith(']')) {
		errors.push(`${file}: depends_on must use [P0-000, ...] syntax`)
		return []
	}
	const content = raw.slice(1, -1).trim()
	return content ? content.split(',').map((dependency) => dependency.trim()) : []
}

const tasks = new Map()
const files = readdirSync(backlogDir)
	.filter((file) => file.endsWith('.md'))
	.sort()

for (const file of files) {
	const source = readFileSync(join(backlogDir, file), 'utf8')
	const id = field(source, 'id')
	const title = field(source, 'title')
	const phase = field(source, 'phase')
	const status = field(source, 'status')
	const owner = field(source, 'owner')
	const dependencySource = field(source, 'depends_on')
	const dependencies = parseDependencies(dependencySource, file)

	for (const [name, value] of Object.entries({ id, title, phase, status, owner })) {
		if (!value) errors.push(`${file}: missing ${name}`)
	}
	if (!id) continue
	if (tasks.has(id)) errors.push(`${file}: duplicate id ${id}`)
	if (!file.startsWith(`${id}-`)) errors.push(`${file}: filename must start with ${id}-`)
	if (phase !== id.match(/^P(\d+)-/)?.[1]) errors.push(`${file}: phase does not match ${id}`)
	if (!['todo', 'in-progress', 'blocked', 'done'].includes(status)) {
		errors.push(`${file}: invalid status ${status}`)
	}
	if (!['agent', 'human'].includes(owner)) errors.push(`${file}: invalid owner ${owner}`)
	if (new Set(dependencies).size !== dependencies.length) {
		errors.push(`${file}: duplicate dependency`)
	}
	for (const heading of [
		'## Context',
		'## Task',
		'## Acceptance criteria',
		'## Files',
		'## Outcome',
	]) {
		if (!source.includes(heading)) errors.push(`${file}: missing ${heading}`)
	}
	if (!source.match(/^- \[[ xX]\] /m)) errors.push(`${file}: no checkable acceptance criteria`)

	tasks.set(id, { file, title, phase: Number(phase), status, owner, dependencies })
}

for (const [id, task] of tasks) {
	for (const dependency of task.dependencies) {
		if (dependency === id) errors.push(`${task.file}: self dependency`)
		if (!tasks.has(dependency)) errors.push(`${task.file}: unknown dependency ${dependency}`)
		const dependencyTask = tasks.get(dependency)
		if (dependencyTask && dependencyTask.phase > task.phase) {
			errors.push(`${task.file}: depends on later-phase ${dependency}`)
		}
	}
}

const visiting = new Set()
const visited = new Set()

function visit(id, path = []) {
	if (visited.has(id)) return
	if (visiting.has(id)) {
		errors.push(`dependency cycle: ${[...path, id].join(' -> ')}`)
		return
	}
	visiting.add(id)
	for (const dependency of tasks.get(id)?.dependencies ?? []) visit(dependency, [...path, id])
	visiting.delete(id)
	visited.add(id)
}

for (const id of tasks.keys()) visit(id)

const plan = readFileSync(planPath, 'utf8')
const indexRows = new Map()
const rowPattern = /^\| (P\d+-\d+) \| ([^|]+) \| (agent|human) \| ([^|]+) \|$/gm

for (const match of plan.matchAll(rowPattern)) {
	indexRows.set(match[1], {
		title: match[2].trim(),
		owner: match[3],
		status: match[4].trim(),
	})
}

for (const [id, task] of tasks) {
	const row = indexRows.get(id)
	if (!row) {
		errors.push(`${id}: missing from PLAN index`)
		continue
	}
	if (row.title !== task.title) errors.push(`${id}: PLAN title does not match frontmatter`)
	if (row.owner !== task.owner) errors.push(`${id}: PLAN owner does not match frontmatter`)
	if (row.status !== task.status) errors.push(`${id}: PLAN status does not match frontmatter`)
}

for (const id of indexRows.keys()) {
	if (!tasks.has(id)) errors.push(`${id}: PLAN index row has no backlog task`)
}

if (errors.length > 0) {
	console.error(`Milestone validation failed (${errors.length}):`)
	for (const error of errors) console.error(`- ${error}`)
	process.exitCode = 1
} else {
	console.log(`Milestone valid: ${tasks.size} tasks, acyclic dependencies, synchronized index.`)
}
