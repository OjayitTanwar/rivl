import React, { useEffect, useRef, useState } from "react";
import type { Session, SocialPost } from "../domain/types";
import {
  olderPostComments,
  type CommentCursor,
} from "../services/post-comments";
import { userMessage } from "../security/errors";
import { Button, Notice, Row, Stack, Txt } from "./primitives";
import { SafetyActions } from "./SafetyActions";

/** One page in memory, with latest/older navigation and exact total displayed. */
export function PostComments({
  post,
  session,
}: {
  post: SocialPost;
  session: Session;
}) {
  const [page, setPage] = useState<null | {
    comments: SocialPost["comments"];
    cursor: CommentCursor | null;
    more: boolean;
  }>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const comments = page?.comments ?? post.comments;
  const first = post.comments[0];
  const cursor = page
    ? page.cursor
    : first?.createdAt
      ? { id: first.id, createdAt: first.createdAt }
      : null;
  const more = page
    ? page.more
    : (post.commentCount ?? post.comments.length) > post.comments.length;
  async function older() {
    if (!cursor || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const next = await olderPostComments(session, post.id, cursor);
      if (mounted.current && generation.current === request) setPage(next);
    } catch (failure) {
      if (mounted.current && generation.current === request)
        setError(userMessage(failure));
    } finally {
      if (mounted.current && generation.current === request) setBusy(false);
    }
  }
  return (
    <Stack>
      <Txt weight="700">
        {post.commentCount ?? post.comments.length} comments
      </Txt>
      {more || page ? (
        <Txt size="caption">
          {page ? "Older comments" : "Latest comments"} · {comments.length}{" "}
          shown
        </Txt>
      ) : null}
      {comments.map((comment) => (
        <Stack key={comment.id} gap={4}>
          <Txt size="caption" weight="700">
            {comment.author}
          </Txt>
          <Txt>{comment.text}</Txt>
          <SafetyActions
            id={comment.id}
            kind="comment"
            owner={comment.authorId}
            name={comment.author}
          />
        </Stack>
      ))}
      {error ? <Notice text={error} /> : null}
      {!session.local && (more || page) ? (
        <Row>
          {page ? (
            <Button
              title="Latest"
              variant="quiet"
              disabled={busy}
              onPress={() => {
                generation.current++;
                setPage(null);
                setError(null);
              }}
            />
          ) : null}
          {more && cursor ? (
            <Button
              title="Older comments"
              variant="quiet"
              loading={busy}
              onPress={() => void older()}
            />
          ) : null}
        </Row>
      ) : null}
    </Stack>
  );
}
