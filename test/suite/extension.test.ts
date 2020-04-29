import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
// tslint:disable-next-line: no-duplicate-imports
import { Uri } from 'vscode';

import * as extension from '../../src/extension';

const fixtureDir = path.resolve(
  path.join(__dirname, '..', '..', '..', 'fixtures'),
);

suite('Extension Tests', () => {
  test('cargo tasks are auto-detected', async () => {
    const projectPath = fixtureDir;
    const projects = [
      path.join(projectPath, 'bare-lib-project'),
      path.join(projectPath, 'another-lib-project'),
    ];

    const expected = [
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[0] },
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[1] },
      { subcommand: 'check', group: vscode.TaskGroup.Build },
      { subcommand: 'test', group: vscode.TaskGroup.Test },
      { subcommand: 'clean', group: vscode.TaskGroup.Clean },
      { subcommand: 'run', group: undefined },
    ];

    const whenWorkspacesActive = projects.map(path => {
      const fsPath = Uri.file(path).fsPath;
      return whenWorkspaceActive(fsPath);
    });

    // This makes sure that we set the focus on the opened files (which is what
    // actually triggers the extension for the project)
    await vscode.commands.executeCommand(
      'workbench.action.quickOpen',
      path.join(projects[0], 'src', 'lib.rs'),
    );
    await vscode.commands.executeCommand(
      'workbench.action.acceptSelectedQuickOpenItem',
    );
    await vscode.commands.executeCommand('workbench.action.keepEditor');
    // Wait until the first server is ready
    await Promise.race([whenWorkspacesActive[0], timeoutReject(3000)]);

    assert(await currentTasksInclude([expected[0]]));

    // Now test for the second project
    await vscode.commands.executeCommand(
      'workbench.action.quickOpen',
      path.join(projects[1], 'src', 'lib.rs'),
    );
    await vscode.commands.executeCommand(
      'workbench.action.acceptSelectedQuickOpenItem',
    );
    // Wait until the second server is ready
    await Promise.race([whenWorkspacesActive[1], timeoutReject(3000)]);
    assert(await currentTasksInclude(expected));
  }).timeout(0);
});

async function currentTasksInclude(
  expected: Array<{
    subcommand: string;
    group: vscode.TaskGroup | undefined;
    cwd?: string;
  }>,
): Promise<boolean> {
  const tasks = await vscode.tasks.fetchTasks();

  return expected.every(({ subcommand, group, cwd }) =>
    tasks.some(
      task =>
        task.definition.type === 'cargo' &&
        task.definition.subcommand === subcommand &&
        task.group === group &&
        (!cwd ||
          cwd ===
            (task.execution &&
              task.execution.options &&
              task.execution.options.cwd)),
    ),
  );
}

/**
 * Returns a promise when a client workspace will become active with a given path.
 * @param fsPath normalized file system path of a URI
 */
function whenWorkspaceActive(
  fsPath: string,
): Promise<extension.ClientWorkspace> {
  return new Promise(resolve => {
    const disposable = extension.activeWorkspace.observe(value => {
      if (value && value.folder.uri.fsPath === fsPath) {
        disposable.dispose();
        return resolve();
      }
    });
  });
}

const timeoutReject = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out')), ms),
  );
