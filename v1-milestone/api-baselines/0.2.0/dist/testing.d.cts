import { Workspace } from './index.cjs';

declare function createMockWorkspace<S extends object = Record<string, unknown>>(): Workspace<S>;
interface TestCluster<S extends object> {
    createTab(): Workspace<S>;
}
declare function createTestCluster<S extends object = Record<string, unknown>>(_namespace: string): TestCluster<S>;

export { type TestCluster, createMockWorkspace, createTestCluster };
