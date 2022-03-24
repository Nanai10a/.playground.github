import type { PromiseType } from "utility-types";

import { getInput, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { isRight } from "fp-ts/Either";
import * as io from "io-ts";
import * as path from "path";
import { execSync } from "child_process";

// import value from input fields of action
const token = getInput("token");
const event = getInput("event");

// get api wrapper
const octokit = getOctokit(token);

// define required fields ( from `issue_comment` )
const Event = io.type({
  action: io.union([io.literal("created"), io.literal("editied")]),
  comment: io.type({
    body: io.string,
  }),
  issue: io.type({
    pull_request: io.union([
      io.type({
        url: io.string,
      }),
      io.undefined,
    ]),
  }),
});

// search string
const MERGE_COMMAND = "=>merge";

// main process
const main = async () => {
  // check event types
  const decoded = Event.decode(JSON.parse(event));
  if (!isRight(decoded)) throw new Error("not satisfied required field of event");
  const decodedEvent = decoded.right;

  // if not satisfied conditions, then ignore
  if (!checkEvent(decodedEvent)) return await cancel();

  // get pull number
  const splitPrUrl = decodedEvent.issue.pull_request?.url.split(path.sep);
  const pull_number = parseInt(splitPrUrl?.[splitPrUrl.length - 1] ?? "");
  // if is invalid, then ignore
  if (pull_number <= 0) return await cancel();

  // get pull infos
  const { data: pull } = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number,
  });

  // is not satisfied condition, then ignore
  if (!checkPull(pull)) return await cancel();

  // --- responses ---

  if (pull.changed_files !== 1)
    return await comment(pull_number, `expect changed_files is 1, got ${pull.changed_files}`);

  if (!pull.mergeable) return await comment(pull_number, "not ready for merge");

  if (pull.mergeable_state !== "clean")
    return await comment(
      pull_number,
      `expect mergeable_state is "clean", got "${pull.mergeable_state}"`,
    );

  // --- do merge ---

  // setup git committer
  execSync("git config user.name 'github-actions[bot]'");
  execSync("git config user.email '41898282+github-actions[bot]@users.noreply.github.com'");

  // create file
  const date = new Date();
  execSync(`echo ${date.toUTCString()} > ${Number(date)}.time`);

  // commit file
  execSync("git add -A");
  execSync("git commit --author . -m '[bot] crated diff'");
  execSync("git push");

  await new Promise((r) => setTimeout(r, 10 * 1000));

  // merge
  const result = await octokit.rest.pulls.merge({ pull_number, ...context.repo });
  console.log(`merge result: ${JSON.stringify(result, undefined, 2)}`);
};

type Event = io.TypeOf<typeof Event>;
const checkEvent = (e: Event) => {
  // event from pull (not issue)
  if (e.issue.pull_request === undefined) return false;

  // includes invoke command (non-case-sensitive)
  const matched =
    e.comment.body
      .split("\n")
      .map((l) => l.toLowerCase())
      .filter((l) => l === MERGE_COMMAND).length >= 1;
  if (!matched) return false;

  return true;
};

type Pull = PromiseType<ReturnType<Octokit["rest"]["pulls"]["get"]>>["data"];
const checkPull = (p: Pull) => {
  // pull is open
  switch (p.state) {
    case "open":
      break;

    case "closed":
      return false;
  }

  // pull merge to `articles`
  if (p.base.ref !== "master") return false;

  return true;
};

type Octokit = ReturnType<typeof getOctokit>;
const cancel = () => {
  octokit.rest.actions.cancelWorkflowRun({ run_id: context.runId, ...context.repo });

  return new Promise((r) => setTimeout(r, 60 * 1000)) as Promise<void>;
};

const comment = (pull_number: number, body: string) =>
  octokit.rest.issues.createComment({
    issue_number: pull_number,
    body,
    ...context.repo,
  });

main().catch((e) => {
  if (e instanceof Error) setFailed(`error occurred: ${e.message}`);
  else setFailed(`unknown error occurred: ${e}`);
});
