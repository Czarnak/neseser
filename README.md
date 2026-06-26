# Neseser

An Obsidian plugin for comprehensive multi-project management. Neseser treats your folders as projects and your notes as tasks, providing powerful visualization and synchronization features.

## Features

- **Projects as Folders**: Organize your work naturally using Obsidian's folder structure. Each folder represents a project.
- **Tasks as Notes**: Every note within a project folder can act as a task, allowing you to attach metadata, context, and detailed information.
- **Project Templates**: Reuse full project folder structures from a vault-root `NeseserTemplates` folder.
- **Multiple Views**:
  - **Dashboard View**: Get an overview of all your active projects and their status.
  - **Kanban View**: Visualize your tasks across different stages.
  - **Calendar View**: See your deadlines and schedule at a glance.
- **TickTick Sync**: Seamlessly synchronize your tasks with TickTick.

## Installation

### Manual Installation

1. Download the latest release from the [Releases](../../releases) page.
2. Extract the downloaded archive.
3. Move the `neseser` folder to your Obsidian vault's plugin directory: `.obsidian/plugins/neseser/`.
4. Open Obsidian settings, navigate to **Community plugins**, disable Safe mode, and enable the **Neseser** plugin.

### Installation via BRAT

If you use the [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, you can install Neseser directly from this repository:

1. Open BRAT settings.
2. Click on **Add Beta plugin**.
3. Enter the repository URL.
4. Enable the plugin in the **Community plugins** settings.

## Usage

1. **Enable the Plugin**: Go to Obsidian Settings -> Community plugins and enable "Neseser".
2. **Configure Settings**: Open the Neseser settings to configure your root project folder, view preferences, and TickTick synchronization details.
3. **Open Views**: Use the command palette (`Ctrl/Cmd + P`) and type `Neseser` to find commands for opening the Dashboard, Kanban, Calendar, or List views.

### Project Templates

Project templates are normal Obsidian folders stored at the vault root in `NeseserTemplates`.
Neseser does not manage templates in plugin settings.

To create a template:

1. Create a folder named `NeseserTemplates` at the root of your vault.
2. Add one direct child folder per template, for example `NeseserTemplates/Research Project`.
3. Inside each template folder, add a matching top-level project note with the same name, for example `NeseserTemplates/Research Project/Research Project.md`.
4. Put any task notes, supporting notes, subfolders, project frontmatter, default category, deadline, and body content inside that template folder.

When creating a new project, choose the template in the **New project** modal.
Neseser copies the full template folder into your configured projects folder, renames the new project folder, and renames only the copied top-level project note to match the new project name.
It does not rewrite note bodies, wikilinks, task names, category, deadline, or other frontmatter.

Template requirements:

- Templates must be direct children of `NeseserTemplates`.
- A valid template must contain `<Template Name>.md` at the top level of the template folder.
- Do not include TickTick sync identity fields in template notes: `ticktick-project-id`, `ticktick-id`, or `ticktick-etag`.
- If a template is selected, category and deadline are taken from the copied template content, not from the modal fields.

## Contributing

We welcome contributions! Whether it's reporting bugs, suggesting new features, or submitting pull requests, your help is appreciated.

Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started with development and submit changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
