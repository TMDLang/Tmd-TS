export const diagnosticMeasureFixture = `::SCORE::
** Diagnostic Measure Fixture **
!=120
?=C
<4/4>

Intro:Piano@|0|{
    <4*>
    | 1 2 3 |
}

-> Intro ->#`;

export const inspectorBasicFixture = `::SCORE::
** Inspector Basic Fixture **
!=120
?=C
<4/4>

Theme{
    <4*>
    1 2 3 4
}

A:Piano@|0|{
    <4*>
    1 2 3 4
}

-> A ->#`;

export const macroPlayFixture = `::SCORE::
** Macro Play Fixture **
!=100
?=C
<4/4>

Theme{
    <4*>
    1 2 3 4
}

-> (play Theme Violin) ->#`;

export const musicXmlExportFixture = `::SCORE::
** MusicXML Export Fixture **
!=120
?=C
<4/4>

Theme{
    <4*>
    1 2 3 4
}

A:Piano@|0|{
    <4*>
    1 2 3 4
}

-> A ->#`;
