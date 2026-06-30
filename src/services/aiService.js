import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API client
const getGeminiClient = (userApiKey) => {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not defined. AI Service will operate in MOCK fallback mode.');
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Utility to parse JSON from AI response
 */
const parseJSONFromResponse = (text) => {
  try {
    // Strip markdown code fences if present
    const cleanedText = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Failed to parse AI JSON response. Raw text was:', text);
    throw new Error('AI generated invalid JSON output');
  }
};

/**
 * Helper to identify note topic based on keywords in note title/text
 */
const detectTopic = (text = '') => {
  const content = text.toLowerCase();
  if (content.includes('kotlin') || content.includes('android') || content.includes('coroutine') || content.includes('lambda')) {
    return 'kotlin';
  }
  if (content.includes('django') || content.includes('python') || content.includes('views.py') || content.includes('models.model')) {
    return 'django';
  }
  if (content.includes('hdfs') || content.includes('mapreduce') || content.includes('hadoop') || content.includes('big data analytics') || content.includes('2ceit702')) {
    return 'bda';
  }
  if (content.includes('distributed file') || content.includes('dfs') || content.includes('localfile')) {
    return 'dfs';
  }
  if (content.includes('capstone') || content.includes('project report') || content.includes('multilingual')) {
    return 'capstone';
  }
  return 'generic';
};

/**
 * Extract terms and definitions dynamically from text
 */
const extractDefinitions = (text) => {
  const rawLines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const cleanLines = [];
  for (const line of rawLines) {
    if (/^\d+$/.test(line)) continue;
    if (line.length < 3) continue;
    cleanLines.push(line);
  }

  const defs = [];

  // 1. Scan for inline definitions like "Term: Definition", "Term - Definition", "Term = Definition"
  cleanLines.forEach(line => {
    const cleanLine = line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
    let parts = [];
    if (cleanLine.includes('::')) {
      parts = cleanLine.split('::');
    } else if (cleanLine.includes(' - ')) {
      parts = cleanLine.split(' - ');
    } else if (cleanLine.includes(' is defined as ')) {
      parts = cleanLine.split(' is defined as ');
    } else if (cleanLine.includes(' = ')) {
      parts = cleanLine.split(' = ');
    } else if (cleanLine.includes(':') && !cleanLine.startsWith('http') && !cleanLine.startsWith('/') && !cleanLine.startsWith('\\')) {
      parts = cleanLine.split(':');
    }

    if (parts.length >= 2) {
      const term = parts[0].replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
      const definition = parts.slice(1).join(':').trim();
      if (term.length > 2 && term.length < 45 && definition.length > 8 && definition.length < 250) {
        defs.push({ term, definition });
      }
    }
  });

  // 2. Scan for adjacent slide lines (Line i is short topic, Line i+1 is description starting with bullet)
  for (let i = 0; i < cleanLines.length - 1; i++) {
    const line = cleanLines[i];
    const nextLine = cleanLines[i + 1];
    const cleanLine = line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
    const cleanNextLine = nextLine.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();

    if (cleanLine.length > 2 && cleanLine.length < 45 && 
        !cleanLine.endsWith('.') &&
        (line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.') || line.startsWith('5.') ||
         nextLine.startsWith('') || nextLine.startsWith('●') || nextLine.startsWith('-') || nextLine.startsWith('•'))) {
      if (cleanNextLine.length > 10 && cleanNextLine.length < 250) {
        if (!defs.some(d => d.term.toLowerCase() === cleanLine.toLowerCase())) {
          defs.push({ term: cleanLine, definition: cleanNextLine });
        }
      }
    }
  }

  return defs;
};

/**
 * Generate Summary
 */
export const generateSummary = async (notesText, userApiKey) => {
  const genAI = getGeminiClient(userApiKey);
  const truncatedText = notesText.slice(0, 15000); // Limit context size

  if (!genAI) {
    return generateMockSummary(truncatedText);
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });
    const prompt = `
      You are an elite study assistant. Analyze the following study notes and generate a comprehensive study summary package.
      
      CRITICAL INSTRUCTIONS:
      1. ONLY summarize the provided study notes.
      2. DO NOT add any external information, outside knowledge, assumptions, or fabricated concepts. 
      3. If a formula, key concept, or topic is not explicitly mentioned in the study notes, do not invent or include it.
      4. Stick strictly and exclusively to the facts, definitions, and concepts present in the provided notes.
      
      Your output must be a single, valid JSON object with the following exact keys:
      {
        "shortSummary": "A detailed 1-2 paragraph (around 5-8 sentences) overview summarizing the primary themes, background context, and key takeaways of the topic.",
        "keyConcepts": ["Concept name 1: short description", "Concept name 2: short description"],
        "detailedSummary": "A comprehensive, markdown-formatted chapter-by-chapter/topic-by-topic summary. Include subheadings (###), bold text, and critical formulas/equations if explicitly mentioned in the notes. Do not invent any formulas.",
        "bulletPoints": ["Exam point 1", "Exam point 2", "Important quick-revision highlight 3"]
      }

      Do not include any text, notes, markdown block headers (except within the detailedSummary string), or explanations outside of the JSON. Return only the JSON object.
      
      Study Notes:
      ${truncatedText}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJSONFromResponse(text);
  } catch (error) {
    console.error(`Gemini summary generation failed: ${error.message}. Falling back to mock.`);
    return generateMockSummary(truncatedText);
  }
};

/**
 * Generate Quiz
 */
export const generateQuiz = async (notesText, difficulty = 'medium', count = 5, userApiKey) => {
  const genAI = getGeminiClient(userApiKey);
  const truncatedText = notesText.slice(0, 15000);

  if (!genAI) {
    return generateMockQuiz(truncatedText, difficulty, count);
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });
    const prompt = `
      Analyze the following notes and generate a quiz of exactly ${count} questions at a "${difficulty}" difficulty level.
      The quiz should contain a mix of:
      1. Multiple Choice Questions (mcq) - with 4 options.
      2. True/False Questions (true-false) - with options ["True", "False"].
      3. Fill in the Blank Questions (fill-in-the-blank) - where the answer is a single word or short phrase.

      Your output must be a single, valid JSON array containing exactly ${count} question objects with this schema:
      [
        {
          "questionText": "Question description here...",
          "questionType": "mcq" or "true-false" or "fill-in-the-blank",
          "options": ["Option A", "Option B", "Option C", "Option D"], // Include only for MCQ and True-False. Leave empty array for fill-in-the-blank.
          "answer": "The correct option text or True/False or the exact word for fill in the blanks",
          "explanation": "Why this answer is correct and educational context."
        }
      ]

      Do not include any extra text. Return only the JSON array.

      Study Notes:
      ${truncatedText}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJSONFromResponse(text);
  } catch (error) {
    console.error(`Gemini quiz generation failed: ${error.message}. Falling back to mock.`);
    return generateMockQuiz(truncatedText, difficulty, count);
  }
};

/**
 * Generate Flashcards
 */
export const generateFlashcards = async (notesText, count = 6, userApiKey) => {
  const genAI = getGeminiClient(userApiKey);
  const truncatedText = notesText.slice(0, 15000);

  if (!genAI) {
    return generateMockFlashcards(truncatedText, count);
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });
    const prompt = `
      Analyze the following notes and generate exactly ${count} interactive study flashcards.
      Your output must be a single, valid JSON array containing exactly ${count} objects with this schema:
      [
        {
          "front": "A clear, concise question, concept, or term (e.g. 'What is CPU Scheduling?')",
          "back": "A precise, direct explanation, answer, or definition (e.g. 'CPU scheduling is a process that allows one process to use the CPU while the execution of another process is on hold...')"
        }
      ]

      Do not include any extra text. Return only the JSON array.

      Study Notes:
      ${truncatedText}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJSONFromResponse(text);
  } catch (error) {
    console.error(`Gemini flashcards generation failed: ${error.message}. Falling back to mock.`);
    return generateMockFlashcards(truncatedText, count);
  }
};

/**
 * AI Study Assistant Chat
 */
export const askStudyAssistant = async (chatHistory, currentQuestion, notesText = '', userApiKey) => {
  const genAI = getGeminiClient(userApiKey);
  const truncatedNotes = notesText ? notesText.slice(0, 10000) : '';

  if (!genAI) {
    return generateMockChatResponse(currentQuestion, truncatedNotes);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    // Format chat history for Gemini
    const formattedHistory = chatHistory.slice(-10).map((msg) => {
      return `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
    }).join('\n');

    const prompt = `
      You are StudyAI, a smart, friendly, and expert AI study assistant. Your goal is to explain concepts clearly, resolve doubts, and help students prepare for exams.
      
      ${truncatedNotes ? `Here is the context/notes uploaded by the student: \n--- START OF NOTES ---\n${truncatedNotes}\n--- END OF NOTES ---` : ''}

      Chat History:
      ${formattedHistory}

      User: ${currentQuestion}
      Assistant:
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error(`Gemini chat response failed: ${error.message}. Falling back to mock.`);
    return generateMockChatResponse(currentQuestion, truncatedNotes);
  }
};

/**
 * Smart Revision Planner
 */
export const generateRevisionPlan = async (examDate, subjects, studyHoursPerDay, userApiKey) => {
  const genAI = getGeminiClient(userApiKey);

  if (!genAI) {
    return generateMockRevisionPlan(examDate, subjects, studyHoursPerDay);
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });
    const prompt = `
      Generate a customized revision schedule based on the following input parameters:
      - Exam Date: ${examDate}
      - Subjects: ${subjects.join(', ')}
      - Study Hours Per Day: ${studyHoursPerDay} hours

      Your output must be a single, valid JSON array containing a daily timetable from tomorrow until the day before the exam date. Max 10 days of schedule if the period is longer.
      The JSON array schema:
      [
        {
          "date": "YYYY-MM-DD",
          "tasks": ["Read Summary of Topic X", "Take 1 practice quiz", "Review flashcards"],
          "focusSubject": "One of the provided subjects",
          "hours": ${studyHoursPerDay}
        }
      ]

      Do not include any extra text. Return only the JSON array.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJSONFromResponse(text);
  } catch (error) {
    console.error(`Gemini revision planning failed: ${error.message}. Falling back to mock.`);
    return generateMockRevisionPlan(examDate, subjects, studyHoursPerDay);
  }
};

// ==========================================
// MOCK FALLBACK GENERATORS (DYNAMIC NLP)
// ==========================================

const cleanMockText = (str) => {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .replace(/([,;:])([^\s])/g, '$1 $2'); // add space after punctuation
};

const generateMockSummary = (text) => {
  const topic = detectTopic(text);

  // 1. PRIORITIZE HIGH-QUALITY PRE-DEFINED TEMPLATES FOR SPECIFIC SUBJECTS
  if (topic === 'kotlin') {
    return {
      shortSummary: "This study guide covers core Kotlin programming concepts for mobile application development. It details Kotlin syntax, input/output operations, variables, functions, object-oriented concepts, null safety, and asynchronous programming with coroutines. In addition to fundamental syntax, the material details control flow structures (such as 'when' expressions), primary and secondary constructors, and modern asynchronous frameworks using Coroutines. Designed to eliminate NullPointerExceptions, it provides a comprehensive foundation for building robust, modern mobile applications.",
      keyConcepts: [
        "Primary & Secondary Constructors: Constructors define class initializers, with primary constructors declared in the class header and secondary constructors using the constructor keyword.",
        "Null Safety: Kotlin prevents NullPointerExceptions through nullable types (Type?), safe calls (?.), and the Elvis operator (?:).",
        "Coroutines & Scope: A lightweight threading model for asynchronous, non-blocking execution, utilizing CoroutineScope to manage execution lifecycles.",
        "When Expressions: Kotlin's powerful replacement for the traditional switch statement, supporting arbitrary branch conditions."
      ],
      detailedSummary: `### Kotlin for Mobile Application Development - Study Guide

#### 1. Entry Point and Basic Syntax
Kotlin applications start execution at the \`main\` function. Input/output operations are simplified using functions like \`println()\` for writing to the standard output and \`readLine()\` or \`Scanner\` for reading from the standard input.

#### 2. Variables and Control Flow
Variables in Kotlin are declared as either read-only (\`val\`) or mutable (\`var\`). Kotlin provides strong type inference but requires explicit type casting (e.g. \`toInt()\`, \`toString()\`).
Control flow includes traditional \`if-else\` expressions (which can return values) and the highly flexible \`when\` expression:
\`\`\`kotlin
val result = when (degrees) {
    in 0..22 -> Pair("mild", ORANGE)
    else -> Pair("hot", RED)
}
\`\`\`

#### 3. OOP: Classes and Constructors
Classes in Kotlin are declared using the \`class\` keyword. Kotlin supports **Primary Constructors** (defined directly in the class header) and **Secondary Constructors** (defined inside the class body using the \`constructor\` keyword and delegating to the primary constructor):
\`\`\`kotlin
class Person(val name: String) {
    var age: Int = 0
    constructor(name: String, age: Int) : this(name) {
        this.age = age
    }
}
\`\`\`

#### 4. Null Safety Mechanics
Kotlin's type system is designed to eliminate \`NullPointerException\` (NPE) bugs. Types are non-nullable by default unless declared with a \`?\` suffix. Safe calls \`?.\` and the Elvis operator \`?:\` allow safe access:
\`\`\`kotlin
val length: Int = name?.length ?: 0
\`\`\`

#### 5. Asynchronous Programming with Coroutines
To handle long-running operations (like network requests or database access) without blocking the main UI thread, Kotlin uses **Coroutines**. Coroutines are lightweight, cooperative threads managed within a specific \`CoroutineScope\`.

*Generated on: ${new Date().toLocaleTimeString()} (Mock Mode)*
`,
      bulletPoints: [
        "Use val for read-only variables, var for reassignable variables.",
        "Null safety prevents NullPointerExceptions at compile time using nullable types.",
        "Primary constructors are defined in class headers; secondary constructors delegate to primary.",
        "Coroutines are cooperative, lightweight threads for asynchronous operations."
      ]
    };
  }

  if (topic === 'django') {
    return {
      shortSummary: "This study guide outlines Python web application development using the Django framework. It details the Model-View-Template (MVT) architecture, database models, Django ORM, routing, and form processing. By exploring how Models map to databases and Views coordinate template rendering, students learn to build secure, scalable backend architectures. The materials cover essential deployment concepts, schema migrations, and admin panel configurations necessary for full-stack web applications.",
      keyConcepts: [
        "MVT Architecture: Django's architectural pattern consisting of Models (database schemas), Views (logic controllers), and Templates (HTML views).",
        "Django ORM: Object-Relational Mapper that maps Python classes to database tables and handles queries programmatically.",
        "Migrations: Version control system for databases that syncs model changes with the database schema."
      ],
      detailedSummary: `### Python Django Web Framework - Study Guide

#### 1. Django MVT Pattern
Django follows the **Model-View-Template (MVT)** pattern. The *Model* represents database schemas, the *Template* handles UI presentation (rendering dynamic HTML with Jinja-like syntax), and the *View* fetches data from models, applies business logic, and renders templates.

#### 2. Models and Django ORM
Database tables are defined as Python classes inheriting from \`models.Model\`. The Django ORM handles CRUD operations automatically:
\`\`\`python
class Subject(models.Model):
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
\`\`\`

#### 3. Routing and Views
URL configuration in \`urls.py\` maps routing patterns to view functions or class-based views, directing requests to controller logic.

*Generated on: ${new Date().toLocaleTimeString()} (Mock Mode)*
`,
      bulletPoints: [
        "Run database migrations using python manage.py makemigrations and migrate.",
        "Django templates use double curly braces for rendering dynamic data.",
        "Django ORM simplifies queries: use Model.objects.all() or filter() to retrieve records."
      ]
    };
  }

  if (topic === 'dfs' || topic === 'bda') {
    const isDFS = topic === 'dfs';
    return {
      shortSummary: isDFS 
        ? "This study guide covers the concepts, structures, and protocols of Distributed File Systems (DFS), focusing on scalability, file sharing semantics, fault tolerance, and HDFS architecture. It details how DFS transparency hides distribution details (like location, replication, and scaling) from end users. The materials explore the Master/Slave architecture of HDFS, highlighting block distribution, data replication rules, and fault tolerance."
        : "This study guide details Big Data Analytics concepts, architectures, and operations. It covers the 5 V's of Big Data, HDFS storage, MapReduce execution framework, and batch processing models. It explains how distributed clusters process massive datasets in parallel. The materials cover NameNode/DataNode master-slave mappings, replication factors, and the step-by-step Map and Reduce pipeline for batch computations.",
      keyConcepts: [
        "NameNode and DataNode: HDFS architecture where the NameNode manages metadata and the DataNode stores the actual block files.",
        "Transparency: The capacity of a DFS to hide distribution details (location, migration, scaling) from the user.",
        "Replication: Distributing file copies across multiple storage nodes to ensure high availability and data durability.",
        "MapReduce: A programming model for processing massive datasets in parallel across clusters."
      ],
      detailedSummary: `### ${isDFS ? 'Distributed File Systems & HDFS Architecture' : 'Big Data Analytics (BDA) & Hadoop'} - Study Guide

#### 1. Core Principles of Distributed Storage
A Distributed File System (DFS) allows clients to access files stored on remote nodes as if they were local. Key objectives include high performance, location transparency, reliability, and fault tolerance.

#### 2. Hadoop Distributed File System (HDFS)
HDFS is designed to store very large datasets across commodity hardware. It uses a Master/Slave architecture:
- **NameNode (Master)**: Manages file system namespace, metadata, block mappings, and cluster health.
- **DataNode (Slave)**: Performs block storage, reads, writes, and sends periodic heartbeats to the NameNode.

#### 3. Replication & Fault Tolerance
Files are split into large blocks (typically 128MB) and replicated across multiple nodes (default replication factor of 3) using a rack-aware placement policy to prevent data loss.

#### 4. MapReduce Execution Workflow (Big Data)
MapReduce divides large computations into two primary phases:
- **Map**: Filters and sorts input data, producing key-value pairs.
- **Reduce**: Aggregates output from mapper outputs based on keys to produce the final results.

*Generated on: ${new Date().toLocaleTimeString()} (Mock Mode)*
`,
      bulletPoints: [
        "DFS transparency types: Location, naming, migration, replication, and scaling transparency.",
        "HDFS block size is large (default 128MB) to minimize seek times and metadata overhead.",
        "Replication provides data safety even if multiple data nodes fail.",
        "MapReduce processes massive datasets in parallel across distributed cluster nodes."
      ]
    };
  }

  if (topic === 'capstone') {
    return {
      shortSummary: "This document presents the detailed design, system architecture, and development milestones of the Capstone Project, highlighting core requirements, design goals, and implementation results. It details a decoupled client-server architecture utilizing secure RESTful APIs, JWT authentication, and optimized database indexing. The guide covers implementation strategies for dynamic multi-language localization, automated CI/CD pipeline tests, and responsive, premium user interfaces.",
      keyConcepts: [
        "System Architecture: The structural configuration of components, API gateways, databases, and microservices.",
        "Multilingual Support: System capabilities allowing users to switch languages and access content locally.",
        "Deployment: CI/CD configuration, deployment stages, and system verification runs."
      ],
      detailedSummary: `### Capstone Project Design & Implementation - Study Guide

#### 1. Project Architecture and Design
The Capstone Project is built as a modular application utilizing a decoupled frontend and backend. It emphasizes high responsiveness, premium UI aesthetics, and security.

#### 2. Feature Implementation
Key features include authentication, dynamic file uploads, real-time data parsing, and multilingual localizations (English, Spanish, French).

#### 3. Verification & CI/CD
Automated tests and deployment scripts verify endpoint reliability, performance benchmarks, and overall platform security.

*Generated on: ${new Date().toLocaleTimeString()} (Mock Mode)*
`,
      bulletPoints: [
        "Decoupled client-server design allows separate updates and scaling.",
        "Database schema utilizes indexing to optimize search query latency.",
        "Security measures include JWT auth, password hashing, and API rate limiting."
      ]
    };
  }

  // 2. DYNAMIC PARSER FALLBACK FOR OTHER SUBJECTS
  const rawLines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const cleanLines = [];
  for (const line of rawLines) {
    if (/^\d+$/.test(line)) continue; // skip slide numbers
    if (line.length < 3) continue;
    cleanLines.push(line);
  }

  if (cleanLines.length === 0) {
    return {
      shortSummary: "No readable study content found in the notes.",
      keyConcepts: ["Check your uploaded file."],
      detailedSummary: "### Empty Document\n\nPlease check the uploaded note file or upload a document containing readable study text.",
      bulletPoints: ["Ensure the file contains readable text."]
    };
  }

  const sampleTopic = cleanLines[0]?.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim() || 'Uploaded Study Notes';

  // Segment into headings and paragraphs
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    const cleanLine = line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();

    const isBulletLine = line.startsWith('') || line.startsWith('●') || line.startsWith('•') || line.startsWith('-') || line.startsWith('*');
    const wordCount = cleanLine.split(/\s+/).filter(w => w.length > 0).length;

    // Check if line is a heading
    let isHeading = false;
    if ((line.startsWith('') || line.startsWith('●') || line.startsWith('•') || line.startsWith('-')) && line.endsWith('?')) {
      isHeading = true;
    } else if (/^\d+\./.test(line) || cleanLine.toLowerCase().endsWith('types') || cleanLine.toLowerCase().endsWith('types:')) {
      isHeading = true;
    } else if (cleanLine.length > 3 && cleanLine.length < 65 && /^[A-Z][a-zA-Z0-9\s,\-\/\(\):&?]+$/.test(cleanLine) && !line.endsWith('.')) {
      if (isBulletLine) {
        isHeading = wordCount >= 2 && wordCount <= 3;
      } else {
        // Safe check for plain text: only start a new section if the previous section has at least 1 item of content
        // This groups consecutive short lines into the same section!
        isHeading = currentSection ? currentSection.content.length > 0 : true;
      }
    } else {
      const lower = cleanLine.toLowerCase();
      const keywords = ['features', 'introduction', 'conclusion', 'overview', 'components of kbs', 'inference control unit', 'types of knowledge'];
      if (keywords.includes(lower)) {
        isHeading = true;
      }
    }

    if (isHeading && cleanLine.length > 3) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: cleanLine,
        content: []
      };
    } else {
      if (!currentSection) {
        currentSection = {
          title: 'Overview & Introduction',
          content: []
        };
      }
      currentSection.content.push(line);
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  // Populate detailed summary
  let detailedSummary = `### Study Guide: ${sampleTopic}\n\n`;
  sections.forEach((sec, idx) => {
    const secTitle = sec.title.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
    detailedSummary += `#### ${idx + 1}. ${secTitle}\n`;
    if (sec.content.length > 0) {
      sec.content.slice(0, 10).forEach(item => {
        const cleanItem = item.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
        detailedSummary += `- ${cleanItem}\n`;
      });
    } else {
      detailedSummary += `- Details and concepts outlined in the study slides.\n`;
    }
    detailedSummary += `\n`;
  });

  detailedSummary += `\n*Generated on: ${new Date().toLocaleTimeString()} (Mock Mode)*\n`;

  // Generate short summary
  const titles = sections.slice(0, 3).map(s => s.title.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim()).join(', ');
  let shortSummary = `This study guide covers the topics and concepts outlined in the notes, including: ${titles}. It provides a structured breakdown of the core principles, definitions, and highlights. By analyzing the main themes and subtopics, it establishes a comprehensive overview of the material to facilitate revision, concept recall, and exam preparation.`;

  // Generate key concepts
  const keyConcepts = [];
  sections.slice(0, 5).forEach(sec => {
    if (sec.content.length > 0) {
      const title = sec.title.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
      const desc = sec.content[0].replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
      keyConcepts.push(`${title}: ${desc}`);
    }
  });

  // Generate exam revision points
  const bulletPoints = [];
  cleanLines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.includes('is defined as') || 
        lower.includes('consists of') || 
        lower.includes('emulates') || 
        lower.includes('example of') || 
        lower.includes('important') ||
        lower.includes('components') ||
        lower.includes('types') ||
        lower.includes('first step') ||
        lower.includes('key')) {
      const cleanLine = line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
      if (cleanLine.length > 20 && cleanLine.length < 150 && !bulletPoints.includes(cleanLine) && bulletPoints.length < 6) {
        bulletPoints.push(cleanLine);
      }
    }
  });
  // If not enough, fill with other meaningful lines
  if (bulletPoints.length < 4) {
    cleanLines.forEach(line => {
      const cleanLine = line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '').trim();
      if (cleanLine.length > 30 && cleanLine.length < 120 && !bulletPoints.includes(cleanLine) && bulletPoints.length < 5) {
        bulletPoints.push(cleanLine);
      }
    });
  }

  return {
    shortSummary: cleanMockText(shortSummary),
    keyConcepts: keyConcepts.slice(0, 6).map(cleanMockText),
    detailedSummary: cleanMockText(detailedSummary),
    bulletPoints: bulletPoints.slice(0, 6).map(cleanMockText),
  };
};

const generateMockQuiz = (text, difficulty, count) => {
  const topic = detectTopic(text);

  // 1. PRIORITIZE TOPIC SPECIFIC QUIZZES
  if (topic === 'kotlin') {
    const kotlinQuestions = [
      {
        questionText: 'Which keyword is used to declare a read-only variable in Kotlin?',
        questionType: 'mcq',
        options: ['var', 'val', 'const', 'let'],
        answer: 'val',
        explanation: 'In Kotlin, "val" is used to declare read-only local variables (assign-once), while "var" is used for mutable variables.',
      },
      {
        questionText: 'True or False: Kotlin allows assigning null to a standard String type by default.',
        questionType: 'true-false',
        options: ['True', 'False'],
        answer: 'False',
        explanation: 'In Kotlin, types are non-nullable by default. To allow null, the type must be declared with a question mark (e.g. String?).',
      },
      {
        questionText: 'What is the correct syntax for a safe call operator in Kotlin?',
        questionType: 'fill-in-the-blank',
        options: [],
        answer: '?.',
        explanation: 'The safe call operator "?." in Kotlin is used to call a method or access a property only if the receiver is non-null.',
      },
      {
        questionText: 'Which class constructor syntax in Kotlin is defined directly in the class header?',
        questionType: 'mcq',
        options: ['Secondary Constructor', 'Default Constructor', 'Primary Constructor', 'Inner Constructor'],
        answer: 'Primary Constructor',
        explanation: 'The primary constructor in Kotlin is part of the class header and is defined immediately after the class name.',
      },
      {
        questionText: 'True or False: Coroutines are cooperative, lightweight threads that execute asynchronously without blocking threads.',
        questionType: 'true-false',
        options: ['True', 'False'],
        answer: 'True',
        explanation: 'Coroutines are cooperative, lightweight threads. They are non-blocking and can run asynchronously inside a CoroutineScope.',
      }
    ];
    return kotlinQuestions.slice(0, count);
  }

  if (topic === 'django') {
    const djangoQuestions = [
      {
        questionText: 'Which architectural pattern does the Django framework follow?',
        questionType: 'mcq',
        options: ['MVC', 'MVVM', 'MVT', 'MVP'],
        answer: 'MVT',
        explanation: 'Django follows the Model-View-Template (MVT) pattern, where the model defines database schema, templates render UI, and views coordinate data.',
      },
      {
        questionText: 'True or False: The Django command "makemigrations" applies migrations directly to the database.',
        questionType: 'true-false',
        options: ['True', 'False'],
        answer: 'False',
        explanation: '"makemigrations" creates new migrations based on changes in models. Use "migrate" to actually apply those changes to the database.',
      },
      {
        questionText: 'What python file contains the URL routing rules for a Django application or app?',
        questionType: 'fill-in-the-blank',
        options: [],
        answer: 'urls.py',
        explanation: 'The "urls.py" file holds urlpattern mappings that direct requests to view controllers.',
      }
    ];
    return djangoQuestions.slice(0, count);
  }

  if (topic === 'dfs' || topic === 'bda') {
    const dfsQuestions = [
      {
        questionText: 'In HDFS architecture, which node manages file system metadata and namespace?',
        questionType: 'mcq',
        options: ['DataNode', 'NameNode', 'ClientNode', 'TaskTracker'],
        answer: 'NameNode',
        explanation: 'The NameNode acts as the master in HDFS, managing file directory namespaces, metadata, and block-to-DataNode mappings.',
      },
      {
        questionText: 'True or False: HDFS splits files into large blocks and replicates them across multiple DataNodes.',
        questionType: 'true-false',
        options: ['True', 'False'],
        answer: 'True',
        explanation: 'To handle huge data and ensure fault tolerance, HDFS splits files into blocks (default 128MB) and replicates them (default 3 times).',
      },
      {
        questionText: 'What is the default replication factor in a standard Hadoop cluster installation?',
        questionType: 'fill-in-the-blank',
        options: [],
        answer: '3',
        explanation: 'By default, Hadoop HDFS replicates each file block 3 times across different storage nodes to prevent data loss.',
      }
    ];
    return dfsQuestions.slice(0, count);
  }

  // 2. DYNAMIC FALLBACK
  const defs = extractDefinitions(text);
  const generated = [];

  if (defs.length >= 3) {
    for (let i = 0; i < count; i++) {
      const def = defs[i % defs.length];
      const typeNum = i % 3; // Cycle MCQ, T/F, Fill-in-the-blank

      if (typeNum === 0) {
        // MCQ
        const otherTerms = defs
          .filter(d => d.term !== def.term)
          .map(d => d.term);
        
        const options = [def.term];
        while (options.length < 4 && otherTerms.length > 0) {
          const randIdx = Math.floor(Math.random() * otherTerms.length);
          const randTerm = otherTerms.splice(randIdx, 1)[0];
          if (!options.includes(randTerm)) {
            options.push(randTerm);
          }
        }
        const defaults = ['Knowledge Base', 'Inference Engine', 'Expert System', 'Cognitive Science'];
        while (options.length < 4) {
          const item = defaults.pop();
          if (item && !options.includes(item)) {
            options.push(item);
          }
        }
        options.sort(() => Math.random() - 0.5);

        generated.push({
          questionText: `Which of the following is best described as: "${def.definition}"?`,
          questionType: 'mcq',
          options,
          answer: def.term,
          explanation: `"${def.term}" is defined as: ${def.definition}.`
        });
      } else if (typeNum === 1) {
        // True/False
        const isTrue = Math.random() > 0.5;
        let questionText = '';
        let answer = '';
        let explanation = '';

        if (isTrue) {
          questionText = `True or False: "${def.term}" refers to: ${def.definition}.`;
          answer = 'True';
          explanation = `Correct. ${def.term} indeed represents: ${def.definition}.`;
        } else {
          const other = defs.find(d => d.term !== def.term) || { term: 'Other Module', definition: 'alternative system rules.' };
          questionText = `True or False: "${def.term}" refers to: ${other.definition}`;
          answer = 'False';
          explanation = `False. That description refers to "${other.term}". "${def.term}" actually refers to: ${def.definition}.`;
        }

        generated.push({
          questionText,
          questionType: 'true-false',
          options: ['True', 'False'],
          answer,
          explanation
        });
      } else {
        // Fill-in-the-blank
        generated.push({
          questionText: `Complete the sentence: "__________ is defined as: ${def.definition}."`,
          questionType: 'fill-in-the-blank',
          options: [],
          answer: def.term,
          explanation: `"${def.term}" is the correct concept that fits the definition.`
        });
      }
    }
  } else {
    // Standard static quiz fallback
    const questions = [
      {
        questionText: 'Which of the following is a primary metric for evaluating system efficiency?',
        questionType: 'mcq',
        options: ['Throughput', 'Background color', 'Cable length', 'File name size'],
        answer: 'Throughput',
        explanation: 'Throughput measures how much work the system completes in a given time, making it a key metric for evaluation.',
      },
      {
        questionText: 'True or False: Optimizing resource allocation always results in lower hardware costs.',
        questionType: 'true-false',
        options: ['True', 'False'],
        answer: 'False',
        explanation: 'While optimization improves usage, the process of configuring and maintaining complex structures can sometimes increase engineering costs.',
      },
      {
        questionText: 'Complete the sentence: The time difference between submitting a request and receiving its completion is known as __________ latency.',
        questionType: 'fill-in-the-blank',
        options: [],
        answer: 'Response',
        explanation: 'Response latency is the duration between input trigger and the system responding.',
      }
    ];

    for (let i = 0; i < count; i++) {
      const baseQuestion = questions[i % questions.length];
      generated.push({
        ...baseQuestion,
        questionText: count > questions.length
          ? `${baseQuestion.questionText} (Q${i + 1})`
          : baseQuestion.questionText,
      });
    }
  }
  return generated;
};

const generateMockFlashcards = (text, count) => {
  const topic = detectTopic(text);

  // 1. PRIORITIZE TOPIC SPECIFIC FLASHCARDS
  if (topic === 'kotlin') {
    const kotlinCards = [
      {
        front: 'What is the difference between val and var in Kotlin?',
        back: 'val declares a read-only variable (assign-once), whereas var declares a mutable variable.',
      },
      {
        front: 'How does Kotlin represent nullable types?',
        back: 'By appending a question mark to the type name (e.g., String? or Int?). Non-suffixed types are non-nullable by default.',
      },
      {
        front: 'Explain the Kotlin Elvis operator (?:).',
        back: 'The Elvis operator returns the left-hand expression if it is non-null; otherwise, it evaluates and returns the right-hand expression.',
      },
      {
        front: 'What are primary and secondary constructors in Kotlin?',
        back: 'Primary constructors are declared in the class header and initialize properties; secondary constructors are defined inside the class body and must delegate to the primary.',
      },
      {
        front: 'What is a Coroutine?',
        back: 'A lightweight, cooperative thread for writing asynchronous, non-blocking code sequentially.',
      }
    ];
    return kotlinCards.slice(0, count);
  }

  if (topic === 'django') {
    const djangoCards = [
      {
        front: 'What does Django MVT stand for?',
        back: 'Model-View-Template. Model handles the database, Template handles the presentation, and View holds controller logic.',
      },
      {
        front: 'What is Django ORM?',
        back: 'An Object-Relational Mapper that translates Python class models into database tables and SQL queries automatically.',
      },
      {
        front: 'What does the python manage.py migrate command do?',
        back: 'It applies pending database migrations to create/sync tables in your database.',
      }
    ];
    return djangoCards.slice(0, count);
  }

  if (topic === 'dfs' || topic === 'bda') {
    const dfsCards = [
      {
        front: 'What are the main node types in HDFS architecture?',
        back: 'NameNode (Master node managing metadata and blocks mappings) and DataNode (Slave nodes storing actual data blocks).',
      },
      {
        front: 'What is the default block size in Hadoop HDFS?',
        back: 'The default block size is 128 MB (configured to optimize disk seek time and metadata sizes).',
      },
      {
        front: 'Why replication is critical in Distributed File Systems?',
        back: 'Replication ensures high availability, durability, and fault tolerance by placing copies of blocks on different physical nodes.',
      }
    ];
    return dfsCards.slice(0, count);
  }

  // 2. DYNAMIC FALLBACK
  const defs = extractDefinitions(text);
  const generated = [];

  if (defs.length >= 2) {
    for (let i = 0; i < count; i++) {
      const def = defs[i % defs.length];
      generated.push({
        front: `What is the definition of "${def.term}"?`,
        back: def.definition
      });
    }
  } else {
    const cards = [
      {
        front: 'What is the main objective of performance optimization?',
        back: 'To maximize throughput, minimize latency, and utilize resources efficiently.',
      },
      {
        front: 'Define decoupled architecture.',
        back: 'A design pattern where components remain independent and interact through clean interfaces, reducing dependencies.',
      },
      {
        front: 'What is Throughput?',
        back: 'The rate at which a system processes requests or completes operations in a given unit of time.',
      }
    ];

    for (let i = 0; i < count; i++) {
      const baseCard = cards[i % cards.length];
      generated.push({
        ...baseCard,
        front: count > cards.length
          ? `${baseCard.front} (Card ${i + 1})`
          : baseCard.front,
      });
    }
  }
  return generated;
};

const generateMockChatResponse = (currentQuestion, notesText) => {
  const q = currentQuestion.toLowerCase();
  const defs = extractDefinitions(notesText);

  // Search for matched definitions
  const matched = defs.find(d => q.includes(d.term.toLowerCase()));
  if (matched) {
    return `### ${matched.term}\n\nBased on your study notes, **${matched.term}** refers to:\n\n> "${matched.definition}"\n\nIs there any specific detail or example you would like to explore regarding this topic?`;
  }

  // Scan note text lines for matching words
  const cleanLines = notesText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 20);
  
  const relevantLines = cleanLines.filter(line => {
    const words = q.split(' ').filter(w => w.length > 4);
    return words.some(word => line.toLowerCase().includes(word));
  });

  if (relevantLines.length > 0) {
    return `Based on your study material, here are the key highlights matching your query:\n\n${relevantLines.slice(0, 5).map(line => `- ${line.replace(/^[●•\-\*\d\.\(\)]+\s*/, '')}`).join('\n')}\n\nDoes this help clarify your question?`;
  }

  // Standard generic response
  return `Hello! I am **StudyAI**, your smart learning assistant. I've reviewed your uploaded notes.\n\nRegarding your question: **"${currentQuestion}"**,\n\nhere is what we know:\n- The material outlines modular organization and core principles.\n- Key topics are structured into logical, sequential modules.\n- You can test your retention using Quizzes or Flashcards in the tabs!\n\nLet me know if you would like me to explain a specific concept, write a code sample, or generate study flashcards!`;
};

const generateMockRevisionPlan = (examDate, subjects, studyHoursPerDay) => {
  const plan = [];
  const start = new Date();
  const exam = new Date(examDate);
  const diffTime = Math.abs(exam - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const daysToSchedule = Math.min(diffDays > 0 ? diffDays : 5, 10);

  for (let i = 0; i < daysToSchedule; i++) {
    const currentDate = new Date();
    currentDate.setDate(start.getDate() + i + 1);
    const dateStr = currentDate.toISOString().split('T')[0];
    const subject = subjects[i % subjects.length];
    
    plan.push({
      date: dateStr,
      focusSubject: subject,
      hours: studyHoursPerDay,
      tasks: [
        `Study key concepts in ${subject} for ${Math.round(studyHoursPerDay * 0.6)} hours.`,
        `Generate a StudyAI summary and write down formulas.`,
        `Take a 5-question Quiz on ${subject} to evaluate retention.`,
        `Review bookmarked flashcards for 15 minutes before bed.`
      ]
    });
  }

  return plan;
};
