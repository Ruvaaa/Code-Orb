import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { SequencePlayer } from '../sequencePlayer';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
	});

	test('higher priority sequences interrupt lower priority sequences at boundaries', () => {
		const player = new SequencePlayer();
		assert.strictEqual(player.play({ name: 'blink', frames: [1, 2, 3, 1], priority: 10 }), true);
		assert.strictEqual(player.interrupt({ name: 'celebrate', frames: [1, 43, 1], priority: 35 }), true);
		assert.strictEqual(player.getCurrent()?.name, 'celebrate');
	});

	test('lower priority sequences cannot interrupt active sequences', () => {
		const player = new SequencePlayer();
		player.play({ name: 'celebrate', frames: [1, 43, 1], priority: 35 });
		assert.strictEqual(player.play({ name: 'blink', frames: [1, 2, 3, 1], priority: 10 }), false);
	});

	test('finishing a sequence returns through idle', () => {
		const player = new SequencePlayer();
		player.play({ name: 'blink', frames: [1, 2, 1], priority: 10 });
		assert.deepStrictEqual(player.finish(), [1]);
		assert.strictEqual(player.getCurrent(), undefined);
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});
