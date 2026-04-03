# Architectural Document

## 1. Introduction

This document synthesizes the findings related to the system's architecture, covering its core components, operational mechanisms, and areas requiring further attention. It aims to provide a comprehensive overview for understanding the system's design and interdependencies.

## 2. Agents

### 2.1. Agent Types and Capabilities
*   **Explorer:** Used for codebase exploration, file searching, and understanding project structure.
*   **Coder:** Focuses on code generation, editing, and feature implementation.
*   **Reviewer:** Responsible for code review, bug detection, and suggesting improvements.
*   **Architect:** Designs implementation plans, analyzes requirements, and explores codebase architecture.

### 2.2. Agent Interactions
Agents interact through a central task management system and can be orchestrated in teams for complex operations. Communication can occur via direct messaging or broadcasts within a team.

## 3. State Management

The system's state is managed implicitly through the lifecycle of tasks and the information gathered and processed by agents. There is no explicit, centralized state management system documented. State is primarily held within the context of individual agent operations and task data.

## 4. Tasks

### 4.1. Task Lifecycle
Tasks can be created, claimed, updated (pending, running, completed, failed, cancelled), and their output retrieved. Tasks can be blocked by other tasks, requiring a defined dependency management.

### 4.2. Task Management
Tasks are central to coordinating agent work. They can be assigned to individual agents or managed within teams. The system provides functionalities for listing, retrieving, and updating task statuses.

## 5. Teams

### 5.1. Team Formation and Operation
Teams allow multiple agents (teammates) to work in parallel on related tasks. A team is initiated with a name and a list of teammates, each assigned a specific agent type and task.

### 5.2. Team Coordination
Teammates within a team collaborate concurrently. Status updates from teammates are synthesized upon team completion. Communication channels include direct messages and broadcasts.

## 6. Tools

A variety of tools are available to agents, including:
*   **Code:** `grep`, `glob`, `file_read`, `file_write`, `file_edit`, `repl`, `lsp_diagnostics`, `shell`
*   **Planning & Execution:** `enter_plan_mode`, `exit_plan_mode`, `task_create`, `task_list`, `task_get`, `task_update`, `task_output`, `task_stop`
*   **Teamwork:** `team_create`, `team_status`, `team_message`, `team_check_messages`, `team_task_claim`
*   **Utility:** `web_fetch`, `web_search`, `ask_user`, `sleep`, `tool_search`, `todo_write`, `config_view`, `brief_toggle`, `send_message`, `synthetic_output`
*   **Notebooks:** `notebook_edit`

The specific usage and integration of these tools depend on the agent's role and the task at hand.

## 7. Gaps and Future Considerations: External Interfaces

Currently, there is a notable absence of detailed findings regarding the system's **external interfaces**. This includes:

*   **APIs:** Documentation on any external APIs the system consumes or exposes is missing.
*   **Data Ingress/Egress:** Mechanisms for data entering or leaving the system are not specified.
*   **User Interaction:** Beyond the `ask_user` tool, the broader user interaction model is undocumented.
*   **Third-Party Integrations:** Any integrations with external services or platforms are not detailed.

**Recommendations:**
*   Initiate a focused investigation into the system's external interaction points.
*   Document all external APIs, data flows, and integration protocols.
*   Clarify the user interaction model and any user-facing components.
